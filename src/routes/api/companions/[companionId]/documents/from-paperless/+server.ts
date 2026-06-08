import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { getPaperlessClient, paperlessKey, PAPERLESS_DOC_ID_RE } from '$lib/server/storage';
import { documentExtFromMime, isAllowedDocumentMime } from '$lib/server/storage/mime';
import { MAX_DOCUMENTS_PER_COMPANION, PAPERLESS_CONFIG } from '$lib/server/env';
import { isValidDate } from '$lib/server/validation';

const CATEGORIES = ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getPaperlessClient();
	if (!client || !PAPERLESS_CONFIG) error(404, t(locals.locale, 'error.notFound'));

	const { companionId } = params;
	const body = (await request.json().catch(() => null)) as {
		paperlessId?: unknown;
		category?: unknown;
	} | null;
	const paperlessId = String(body?.paperlessId ?? '').trim();
	if (!PAPERLESS_DOC_ID_RE.test(paperlessId)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}
	const category: Category = CATEGORIES.includes(body?.category as Category)
		? (body!.category as Category)
		: 'other';

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId),
		columns: { id: true }
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const doc = await client.getDocument(paperlessId);
	if (!doc) error(404, t(locals.locale, 'error.notFound'));

	// The import endpoint is the security boundary — the picker is advisory.
	// Enforce the tag scope here even though the search proxy also filters.
	if (PAPERLESS_CONFIG.tagId !== null && !doc.tags.includes(PAPERLESS_CONFIG.tagId)) {
		error(404, t(locals.locale, 'error.notFound'));
	}

	// We serve the archived version (always PDF) when paperless has one;
	// otherwise the original must itself be an allowed type.
	const mimeType = doc.hasArchiveVersion ? 'application/pdf' : doc.originalMimeType;
	if (!isAllowedDocumentMime(mimeType)) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

	const documentId = generateId(15);
	// Ext matches what we actually serve: pdf for archived versions, the
	// original's ext for the rare no-archive case.
	const filename = `${documentId}.${documentExtFromMime(mimeType)}`;
	const title = (doc.title || filename).slice(0, 255);
	// paperless `created` is an ISO datetime; keep the date part, but don't
	// trust upstream format blindly.
	const createdDate = doc.created?.slice(0, 10) ?? '';
	const documentDate = isValidDate(createdDate) ? createdDate : null;
	const uploadedBy = locals.user.id;

	const result = db.transaction(
		(tx) => {
			// Idempotency guard: the same paperless doc twice on one companion
			// is almost certainly a double-click.
			const dupe = tx
				.select({ id: schema.documents.id })
				.from(schema.documents)
				.where(
					and(
						eq(schema.documents.companionId, companionId),
						eq(schema.documents.storageKey, paperlessKey(paperlessId))
					)
				)
				.all();
			if (dupe.length > 0) return { ok: true as const, existingId: dupe[0].id };
			const rows = tx
				.select({ value: count() })
				.from(schema.documents)
				.where(eq(schema.documents.companionId, companionId))
				.all();
			const docCount = rows[0]?.value ?? 0;
			if (docCount >= MAX_DOCUMENTS_PER_COMPANION) return { ok: false as const };
			tx.insert(schema.documents)
				.values({
					id: documentId,
					companionId,
					filename,
					provider: 'paperless',
					storageKey: paperlessKey(paperlessId),
					title,
					category,
					documentDate,
					originalName: null,
					mimeType,
					sizeBytes: null,
					uploadedBy
				})
				.run();
			return { ok: true as const, existingId: null };
		},
		{ behavior: 'immediate' }
	);

	if (!result.ok) {
		error(
			400,
			t(locals.locale, 'error.maxDocumentsExceeded', { max: MAX_DOCUMENTS_PER_COMPANION })
		);
	}

	const finalId = result.existingId ?? documentId;
	const created = await db.query.documents.findFirst({
		where: eq(schema.documents.id, finalId),
		with: { healthEvent: { columns: { id: true, title: true } } }
	});
	// Dupe-path row can vanish between tx commit and this read.
	if (!created) error(404, t(locals.locale, 'error.notFound'));

	return json({ ...created, url: `/api/documents/${companionId}/${created.filename}` });
};
