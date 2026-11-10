import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq } from 'drizzle-orm';
import { getPaperlessClient, PAPERLESS_DOC_ID_RE } from '#lib/server/storage/index.js';
import { insertDocumentRow, preparePaperless } from '#lib/server/documents.js';
import { MAX_DOCUMENTS_PER_COMPANION, PAPERLESS_CONFIG } from '#lib/server/env.js';

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

	const prep = await preparePaperless(paperlessId);
	if (!prep.ok) {
		if (prep.error === 'invalidType') error(400, t(locals.locale, 'error.invalidFileType'));
		error(404, t(locals.locale, 'error.notFound'));
	}
	const { stored } = prep;

	const result = db.transaction(
		(tx) =>
			insertDocumentRow(tx, companionId, stored, {
				title: (stored.upstreamTitle || stored.filename).slice(0, 255),
				category,
				documentDate: stored.upstreamDate,
				healthEventId: null,
				originalName: null,
				uploadedBy: locals.user!.id
			}),
		{ behavior: 'immediate' }
	);

	if (result === 'capReached') {
		error(
			400,
			t(locals.locale, 'error.maxDocumentsExceeded', { max: MAX_DOCUMENTS_PER_COMPANION })
		);
	}

	const finalId = result === 'inserted' ? stored.id : result.existingId;
	const created = await db.query.documents.findFirst({
		where: eq(schema.documents.id, finalId),
		with: { healthEvent: { columns: { id: true, title: true } } }
	});
	// Dupe-path row can vanish between tx commit and this read.
	if (!created) error(404, t(locals.locale, 'error.notFound'));

	return Response.json({ ...created, url: `/api/documents/${companionId}/${created.filename}` });
};
