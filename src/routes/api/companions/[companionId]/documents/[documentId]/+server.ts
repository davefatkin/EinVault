import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { getStorage } from '$lib/server/storage';
import { isValidDate } from '$lib/server/validation';

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
		await db.update(schema.documents).set(updates).where(eq(schema.documents.id, doc.id));
	}

	const updated = await db.query.documents.findFirst({
		where: eq(schema.documents.id, doc.id),
		with: { healthEvent: { columns: { id: true, title: true } } }
	});
	return json({ ...updated, url: `/api/documents/${params.companionId}/${doc.filename}` });
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

	return json({ success: true });
};
