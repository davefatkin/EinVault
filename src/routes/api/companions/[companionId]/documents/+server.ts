import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t, type Locale } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq, and, desc } from 'drizzle-orm';
import { MAX_DOCUMENTS_PER_COMPANION, UPLOAD_MAX_MB } from '#lib/server/env.js';
import {
	discardStored,
	insertDocumentRow,
	prepareUpload,
	storePrepared,
	type StoredDocument
} from '#lib/server/documents.js';
import { isValidDate } from '#lib/server/validation.js';

const CATEGORIES = ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

// NOT exported: SvelteKit only allows HTTP-verb exports from +server.ts.
function parseCategory(raw: unknown): Category {
	return CATEGORIES.includes(raw as Category) ? (raw as Category) : 'other';
}

// Reject a healthEventId that does not belong to this companion. Without
// this check a member could link a document to ANOTHER companion's health
// event (cross-companion leak when listed from the event side).
async function validateHealthEventId(
	raw: unknown,
	companionId: string,
	locale: Locale
): Promise<string | null> {
	if (raw === null || raw === undefined || raw === '') return null;
	if (typeof raw !== 'string') error(400, t(locale, 'error.eventNotFound'));
	const event = await db.query.healthEvents.findFirst({
		where: and(eq(schema.healthEvents.id, raw), eq(schema.healthEvents.companionId, companionId)),
		columns: { id: true }
	});
	if (!event) error(404, t(locale, 'error.eventNotFound'));
	return event.id;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	// Documents are owner-private (receipts, invoices, ownership papers):
	// members and admins only, caretakers excluded everywhere.
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId),
		columns: { id: true }
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const rows = await db.query.documents.findMany({
		where: eq(schema.documents.companionId, params.companionId),
		orderBy: [desc(schema.documents.createdAt)],
		with: {
			healthEvent: { columns: { id: true, title: true } },
			uploader: { columns: { displayName: true } }
		}
	});

	return Response.json({
		documents: rows.map((r) => ({
			...r,
			url: `/api/documents/${params.companionId}/${r.filename}`
		}))
	});
};

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));
	const { companionId } = params;

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId),
		columns: { id: true }
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const formData = await request.formData();
	const prep = await prepareUpload(formData.get('file') as File | null);
	if (!prep.ok) {
		if (prep.error === 'noFile') error(400, t(locals.locale, 'error.noFileProvided'));
		if (prep.error === 'tooLarge')
			error(400, t(locals.locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));
		error(400, t(locals.locale, 'error.invalidFileType'));
	}
	const { prepared } = prep;

	const titleRaw = String(formData.get('title') ?? '').trim();
	const category = parseCategory(formData.get('category'));
	const documentDateRaw = String(formData.get('documentDate') ?? '').trim();
	const documentDate = isValidDate(documentDateRaw) ? documentDateRaw : null;
	const healthEventId = await validateHealthEventId(
		formData.get('healthEventId'),
		companionId,
		locals.locale
	);

	let stored: StoredDocument;
	try {
		stored = await storePrepared(companionId, prepared);
	} catch (err) {
		console.error('[documents] storage put failed:', err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}
	const documentId = stored.id;
	const filename = stored.filename;

	// Count + insert in one immediate transaction so two concurrent uploads
	// cannot both pass the cap check (from-immich TOCTOU pattern).
	const result = db.transaction(
		(tx) =>
			insertDocumentRow(tx, companionId, stored, {
				title: (titleRaw || prepared.fileName || filename).slice(0, 255),
				category,
				documentDate,
				healthEventId,
				originalName: prepared.originalName,
				uploadedBy: locals.user!.id
			}),
		{ behavior: 'immediate' }
	);

	if (result === 'capReached') {
		// Cap hit after the object was stored: remove the orphan.
		await discardStored(stored);
		error(
			400,
			t(locals.locale, 'error.maxDocumentsExceeded', { max: MAX_DOCUMENTS_PER_COMPANION })
		);
	}

	const created = await db.query.documents.findFirst({
		where: eq(schema.documents.id, documentId),
		with: {
			healthEvent: { columns: { id: true, title: true } },
			uploader: { columns: { displayName: true } }
		}
	});

	return Response.json({ ...created, url: `/api/documents/${companionId}/${filename}` });
};
