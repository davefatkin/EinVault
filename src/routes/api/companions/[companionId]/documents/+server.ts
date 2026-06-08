import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t, type Locale } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count, desc } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import sharp from 'sharp';
import { getStorage, STORAGE_BACKEND } from '$lib/server/storage';
import { MAX_DOCUMENTS_PER_COMPANION, UPLOAD_MAX_MB } from '$lib/server/env';
import {
	documentExtFromMime,
	isAllowedDocumentMime,
	looksLikeDocument
} from '$lib/server/storage/mime';
import { isValidDate } from '$lib/server/validation';

const MAX_DOCUMENT_SIZE = UPLOAD_MAX_MB * 1024 * 1024;
const CATEGORIES = ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other'] as const;
type Category = (typeof CATEGORIES)[number];

// NOT exported: SvelteKit only allows HTTP-verb exports from +server.ts.
function documentKey(companionId: string, filename: string): string {
	return `documents/${companionId}/${filename}`;
}

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

	return json({
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
	const file = formData.get('file') as File | null;
	if (!file || file.size === 0) error(400, t(locals.locale, 'error.noFileProvided'));
	if (!isAllowedDocumentMime(file.type)) error(400, t(locals.locale, 'error.invalidFileType'));
	if (file.size > MAX_DOCUMENT_SIZE)
		error(400, t(locals.locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));

	const raw = Buffer.from(await file.arrayBuffer());
	// Reject mislabeled bytes before trusting the client mime (PDFs are
	// stored as-is; HTML-prefix polyglots must die here).
	if (!looksLikeDocument(raw, file.type)) error(400, t(locals.locale, 'error.invalidFileType'));

	const titleRaw = String(formData.get('title') ?? '').trim();
	const category = parseCategory(formData.get('category'));
	const documentDateRaw = String(formData.get('documentDate') ?? '').trim();
	const documentDate = isValidDate(documentDateRaw) ? documentDateRaw : null;
	const healthEventId = await validateHealthEventId(
		formData.get('healthEventId'),
		companionId,
		locals.locale
	);

	const documentId = generateId(15);
	let processed: Buffer;
	let mimeType: string;
	if (file.type === 'application/pdf') {
		// PDFs cannot be re-encoded; stored as-is. Serving-side hardening
		// (CSP sandbox, nosniff, DB-row content type) covers them.
		processed = raw;
		mimeType = 'application/pdf';
	} else if (file.type === 'image/png') {
		// Lossless re-encode: launders structure, strips EXIF, keeps receipts
		// crisp. Larger resize cap than journal photos — these must stay legible.
		try {
			processed = await sharp(raw)
				.resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
				.png()
				.toBuffer();
		} catch {
			error(400, t(locals.locale, 'error.invalidFileType'));
		}
		mimeType = 'image/png';
	} else {
		// jpeg / webp / heic -> JPEG q90. Also converts HEIC to a universally
		// renderable format. sharp without libheif throws on HEIC: surface as
		// invalid file type rather than a 500.
		try {
			processed = await sharp(raw)
				.rotate()
				.resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 90 })
				.toBuffer();
		} catch {
			error(400, t(locals.locale, 'error.invalidFileType'));
		}
		mimeType = 'image/jpeg';
	}

	const ext = documentExtFromMime(mimeType);
	const filename = `${documentId}.${ext}`;
	const key = documentKey(companionId, filename);
	const title = (titleRaw || file.name || filename).slice(0, 255);
	const originalName = (file.name || '').slice(0, 255) || null;
	const uploadedBy = locals.user.id;

	try {
		await getStorage().put({ key, body: processed, contentType: mimeType });
	} catch (err) {
		console.error('[documents] storage put failed:', err);
		error(502, t(locals.locale, 'error.fileNotFound'));
	}

	// Count + insert in one immediate transaction so two concurrent uploads
	// cannot both pass the cap check (from-immich TOCTOU pattern).
	const result = db.transaction(
		(tx) => {
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
					healthEventId,
					filename,
					provider: STORAGE_BACKEND,
					storageKey: key,
					title,
					category,
					documentDate,
					originalName,
					mimeType,
					sizeBytes: processed.length,
					uploadedBy
				})
				.run();
			return { ok: true as const };
		},
		{ behavior: 'immediate' }
	);

	if (!result.ok) {
		// Cap hit after the object was stored: remove the orphan.
		await getStorage()
			.delete(key)
			.catch((err) => console.warn(`[documents] orphan cleanup failed for ${key}:`, err));
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

	return json({ ...created, url: `/api/documents/${companionId}/${filename}` });
};
