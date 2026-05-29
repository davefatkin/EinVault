import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { getImmichClient, immichKey, IMMICH_ASSET_ID_RE } from '$lib/server/storage';
import { isAllowedPhotoMime, safeExtFromMime } from '$lib/server/storage/mime';
import { MAX_DAILY_MEDIA } from '$lib/server/env';
import { isValidDate } from '$lib/server/validation';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const { companionId, date } = params;
	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !IMMICH_ASSET_ID_RE.test(assetId)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));
	if (!isAllowedPhotoMime(asset.originalMimeType)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

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

	const photoId = generateId(15);
	const ext = safeExtFromMime(asset.originalMimeType, asset.originalFileName);
	const filename = `${photoId}.${ext}`;
	const entryId = entry.id;
	const loggedBy = locals.user.id;

	// Wrap count + insert in a transaction so two concurrent picks cannot
	// both observe a count under the cap and then both insert. `immediate`
	// takes the write lock at BEGIN so concurrent transactions serialize
	// cleanly under WAL instead of one hitting SQLITE_BUSY_SNAPSHOT and
	// surfacing as a 500. The local upload path has the same TOCTOU
	// pre-existing; not addressed here.
	const result = db.transaction(
		(tx) => {
			const rows = tx
				.select({ value: count() })
				.from(schema.journalPhotos)
				.where(eq(schema.journalPhotos.entryId, entryId))
				.all();
			const photoCount = rows[0]?.value ?? 0;
			if (photoCount >= MAX_DAILY_MEDIA) {
				return { ok: false as const };
			}
			tx.insert(schema.journalPhotos)
				.values({
					id: photoId,
					entryId,
					filename,
					provider: 'immich',
					storageKey: immichKey(assetId),
					originalName: asset.originalFileName || null,
					mimeType: asset.originalMimeType,
					sizeBytes: asset.fileSizeInByte ?? 0,
					loggedBy
				})
				.run();
			return { ok: true as const };
		},
		{ behavior: 'immediate' }
	);

	if (!result.ok) {
		error(400, t(locals.locale, 'error.maxMediaExceeded', { max: MAX_DAILY_MEDIA }));
	}

	const created = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId),
		with: { logger: { columns: { displayName: true } } }
	});

	return json({
		...created,
		url: `/api/photos/journal/${companionId}/${date}/${filename}`
	});
};
