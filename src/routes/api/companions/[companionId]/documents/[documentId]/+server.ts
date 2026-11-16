import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq, and, or, isNull } from 'drizzle-orm';
import { getStorage } from '#lib/server/storage/index.js';
import { isValidDate } from '#lib/server/validation.js';

const CATEGORIES = ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export const PATCH: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const doc = await db.query.documents.findFirst({
		where: eq(schema.documents.id, params.documentId)
	});
	// 404 (not 403) so document ids are not probeable across companions.
	if (!doc || doc.companionId !== params.companionId)
		error(404, t(locals.locale, 'error.notFound'));

	const contentLength = parseInt(request.headers.get('content-length') ?? '0');
	if (contentLength > 10_000) error(400, t(locals.locale, 'error.requestBodyTooLarge'));

	const body = (await request.json().catch(() => null)) as {
		title?: unknown;
		category?: unknown;
		documentDate?: unknown;
		healthEventId?: unknown;
		onlyIfUnlinked?: unknown;
		onlyIfOn?: unknown;
	} | null;
	if (!body) error(400, t(locals.locale, 'error.notFound'));

	// Strict field allowlist. storageKey/provider/mimeType must never be
	// client-writable: a repointed storageKey is an arbitrary-read primitive
	// through the serving route.
	const updates: Partial<typeof schema.documents.$inferInsert> = {};

	if (body.title !== undefined) {
		const title = String(body.title).trim().slice(0, 255);
		if (!title) error(400, t(locals.locale, 'error.titleAndTypeRequired'));
		updates.title = title;
	}
	if (body.category !== undefined) {
		if (!CATEGORIES.includes(body.category as Category))
			error(400, t(locals.locale, 'error.notFound'));
		updates.category = body.category as Category;
	}
	if (body.documentDate !== undefined) {
		if (body.documentDate === null || body.documentDate === '') {
			updates.documentDate = null;
		} else if (typeof body.documentDate === 'string' && isValidDate(body.documentDate)) {
			updates.documentDate = body.documentDate;
		} else {
			error(400, t(locals.locale, 'error.invalidDate'));
		}
	}
	if (body.healthEventId !== undefined) {
		if (body.healthEventId === null || body.healthEventId === '') {
			updates.healthEventId = null;
		} else if (typeof body.healthEventId === 'string') {
			// Re-validate companion ownership on EVERY set, not just create.
			const event = await db.query.healthEvents.findFirst({
				where: and(
					eq(schema.healthEvents.id, body.healthEventId),
					eq(schema.healthEvents.companionId, params.companionId)
				),
				columns: { id: true }
			});
			if (!event) error(404, t(locals.locale, 'error.eventNotFound'));
			updates.healthEventId = event.id;
		} else {
			error(400, t(locals.locale, 'error.eventNotFound'));
		}
	}

	if (Object.keys(updates).length > 0) {
		// A guarded link (onlyIfUnlinked) takes only a document on no event or
		// already on the target. A guarded unlink (onlyIfOn) clears only the
		// event the caller saw. Either way a document someone put on another
		// event in the meantime is never silently moved or cleared.
		let guardTo: string | null = null;
		if (body.onlyIfUnlinked === true && typeof updates.healthEventId === 'string') {
			guardTo = updates.healthEventId;
		} else if (updates.healthEventId === null && typeof body.onlyIfOn === 'string') {
			guardTo = body.onlyIfOn;
		}
		if (guardTo) {
			// One conditional UPDATE so the check and the write cannot race.
			const { changes } = db
				.update(schema.documents)
				.set(updates)
				.where(
					and(
						eq(schema.documents.id, doc.id),
						or(isNull(schema.documents.healthEventId), eq(schema.documents.healthEventId, guardTo))
					)
				)
				.run();
			if (changes === 0) {
				const current = await db.query.documents.findFirst({
					where: eq(schema.documents.id, doc.id),
					with: { healthEvent: { columns: { title: true } } }
				});
				const title = current?.healthEvent?.title;
				error(
					409,
					title
						? t(locals.locale, 'error.documentOnOtherEvent', { title })
						: t(locals.locale, 'media.actionFailed')
				);
			}
		} else {
			await db.update(schema.documents).set(updates).where(eq(schema.documents.id, doc.id));
		}
	}

	const updated = await db.query.documents.findFirst({
		where: eq(schema.documents.id, doc.id),
		with: { healthEvent: { columns: { id: true, title: true } } }
	});
	return Response.json({ ...updated, url: `/api/documents/${params.companionId}/${doc.filename}` });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const doc = await db.query.documents.findFirst({
		where: eq(schema.documents.id, params.documentId)
	});
	if (!doc || doc.companionId !== params.companionId)
		error(404, t(locals.locale, 'error.notFound'));

	// Paperless backend delete is an intentional no-op (reference only).
	// Delete the DB row unconditionally: an orphaned object is recoverable,
	// a stuck row is not (journal-photos DELETE rationale).
	try {
		await getStorage(doc.provider).delete(doc.storageKey);
	} catch (err) {
		console.warn(`[documents] failed to delete object ${doc.storageKey}:`, err);
	}
	await db.delete(schema.documents).where(eq(schema.documents.id, doc.id));

	return Response.json({ success: true });
};
