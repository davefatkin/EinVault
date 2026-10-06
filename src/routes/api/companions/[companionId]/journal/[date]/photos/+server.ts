import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { getStorage, STORAGE_BACKEND } from '$lib/server/storage';
import { MAX_DAILY_MEDIA } from '$lib/server/env';
import { prepareMediaUpload } from '$lib/server/storage/media-upload';
import { kickWorker } from '$lib/server/video/worker';
import { canModifyMedia } from '$lib/permissions';
import { assertCanWriteJournalMedia } from '$lib/server/permissions';
import { isValidDate } from '$lib/server/validation';

function journalKey(companionId: string, date: string, filename: string): string {
	return `journal/${companionId}/${date}/${filename}`;
}

// Lightweight status poll for the journal UI. Returns just the transcode-relevant
// fields so the client can update a 'processing' video to its transcoded MP4
// (filename/mimeType change, poster appears) without reloading the page and
// clobbering an in-progress journal edit. Scoped like the other handlers:
// caretakers may only read their assigned companions.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const { companionId, date } = params;
	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	if (locals.user.role === 'caretaker') {
		const assignment = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, companionId),
				eq(schema.companionCaretakers.userId, locals.user.id)
			)
		});
		if (!assignment) error(403, t(locals.locale, 'error.forbidden'));
	}

	const entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		),
		columns: { id: true }
	});
	if (!entry) return json({ photos: [] });

	const rows = await db
		.select({
			id: schema.journalPhotos.id,
			status: schema.journalPhotos.status,
			filename: schema.journalPhotos.filename,
			mimeType: schema.journalPhotos.mimeType,
			posterKey: schema.journalPhotos.posterKey
		})
		.from(schema.journalPhotos)
		.where(eq(schema.journalPhotos.entryId, entry.id));

	return json({ photos: rows });
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const { companionId, date } = params;
	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	// Caretakers may only upload to today's entry of an assigned companion while
	// on shift, matching the care journal save.
	await assertCanWriteJournalMedia(locals, companionId, date);

	// Verify companion exists
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	let entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});

	if (!entry) {
		const [created] = await db
			.insert(schema.journalEntries)
			.values({
				id: generateId(15),
				companionId,
				date,
				body: '',
				loggedBy: locals.user?.id ?? null
			})
			.returning();
		entry = created;
	}

	// Check current media count for this entry
	const [{ value: mediaCount }] = await db
		.select({ value: count() })
		.from(schema.journalPhotos)
		.where(eq(schema.journalPhotos.entryId, entry.id));

	if (mediaCount >= MAX_DAILY_MEDIA) {
		error(400, t(locals.locale, 'error.maxMediaExceeded', { max: MAX_DAILY_MEDIA }));
	}

	const formData = await request.formData();
	const file = formData.get('photo') as File | null;

	const mediaId = generateId(15);
	const prepared = await prepareMediaUpload(file, mediaId, locals.locale);
	const { filename } = prepared;
	const key = journalKey(companionId, date, filename);
	try {
		await getStorage().put({
			key,
			body: prepared.body,
			contentType: prepared.contentType
		});
	} catch (err) {
		console.error('[journal-media] storage put failed:', err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}

	await db.insert(schema.journalPhotos).values({
		id: mediaId,
		entryId: entry.id,
		filename,
		provider: STORAGE_BACKEND,
		storageKey: key,
		originalName: file?.name ?? null,
		mediaType: prepared.mediaType,
		mimeType: prepared.contentType,
		sizeBytes: prepared.sizeBytes,
		status: prepared.willTranscode ? 'processing' : 'ready',
		loggedBy: locals.user.id
	});

	if (prepared.willTranscode) kickWorker();

	const created = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, mediaId),
		with: { logger: { columns: { displayName: true } } }
	});

	return json({
		...created,
		url: `/api/photos/journal/${companionId}/${date}/${filename}`
	});
};

export const PATCH: RequestHandler = async ({ url, request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	await assertCanWriteJournalMedia(locals, params.companionId);

	const photoId = url.searchParams.get('photoId');
	if (!photoId) error(400, t(locals.locale, 'error.missingPhotoId'));

	const item = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId)
	});
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));

	const entry = await db.query.journalEntries.findFirst({
		where: eq(schema.journalEntries.id, item.entryId),
		columns: { companionId: true }
	});
	if (!entry || entry.companionId !== params.companionId)
		error(403, t(locals.locale, 'error.forbidden'));

	if (!canModifyMedia(locals.user, item)) error(403, t(locals.locale, 'error.forbidden'));

	const contentLength = parseInt(request.headers.get('content-length') ?? '0');
	if (contentLength > 10_000) error(400, t(locals.locale, 'error.requestBodyTooLarge'));
	const { notes } = await request.json();

	await db
		.update(schema.journalPhotos)
		.set({ notes: notes?.trim() || null })
		.where(eq(schema.journalPhotos.id, photoId));

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	await assertCanWriteJournalMedia(locals, params.companionId);

	const photoId = url.searchParams.get('photoId');
	if (!photoId) error(400, t(locals.locale, 'error.missingPhotoId'));

	const item = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId)
	});
	if (!item) error(404, t(locals.locale, 'error.photoNotFound'));

	const entry = await db.query.journalEntries.findFirst({
		where: eq(schema.journalEntries.id, item.entryId),
		columns: { companionId: true }
	});
	if (!entry || entry.companionId !== params.companionId)
		error(403, t(locals.locale, 'error.forbidden'));

	if (!canModifyMedia(locals.user, item)) error(403, t(locals.locale, 'error.forbidden'));

	// Remove every object this row owns: the primary file plus, for a transcoded
	// video, the kept original and the generated poster. Missing keys are no-ops
	// in the backend delete, so deleting all three is safe regardless of status.
	// Use allSettled and delete the DB row unconditionally: the row is the source
	// of truth, so a transient backend failure on one key must not abort the
	// others or leave an undeletable row (an orphaned object is recoverable; a
	// stuck row is not).
	const backend = getStorage(item.provider);
	const key = item.storageKey ?? journalKey(params.companionId, params.date, item.filename);
	const keys = [key, item.originalKey, item.posterKey].filter(
		(k): k is string => typeof k === 'string' && k.length > 0
	);
	const results = await Promise.allSettled(keys.map((k) => backend.delete(k)));
	results.forEach((r, i) => {
		if (r.status === 'rejected') {
			console.warn(`[journal-media] failed to delete object ${keys[i]}:`, r.reason);
		}
	});

	await db.delete(schema.journalPhotos).where(eq(schema.journalPhotos.id, photoId));

	return json({ success: true });
};
