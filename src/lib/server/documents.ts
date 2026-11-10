import { and, count, eq } from 'drizzle-orm';
import sharp from 'sharp';
import type { DocumentCategory } from '#lib/activityTypes.js';
import { schema } from '#lib/server/db/index.js';
import { MAX_DOCUMENTS_PER_COMPANION, PAPERLESS_CONFIG, UPLOAD_MAX_MB } from '#lib/server/env.js';
import type { Tx } from '#lib/server/medications.js';
import {
	getPaperlessClient,
	getStorage,
	paperlessKey,
	PAPERLESS_DOC_ID_RE,
	STORAGE_BACKEND
} from '#lib/server/storage/index.js';
import {
	documentExtFromMime,
	isAllowedDocumentMime,
	looksLikeDocument
} from '#lib/server/storage/mime.js';
import { generateId } from '#lib/server/utils.js';
import { isValidDate } from '#lib/server/validation.js';

const MAX_DOCUMENT_SIZE = UPLOAD_MAX_MB * 1024 * 1024;
// Bound decoded pixels so a small, highly-compressible image can't decode to
// sharp's ~268MP default and pressure memory. 50MP comfortably covers a
// high-DPI document scan while capping the per-request decode buffer.
const MAX_DECODE_PIXELS = 50_000_000;

/** An uploaded file that passed every check and is ready to store. */
export interface PreparedDocument {
	body: Buffer;
	mimeType: string;
	originalName: string | null;
	/** The upload's own file name, a title fallback. */
	fileName: string;
}

/** A document that exists in storage (or in Paperless) but has no row yet. */
export interface StoredDocument {
	id: string;
	filename: string;
	provider: 'local' | 's3' | 'paperless';
	storageKey: string;
	mimeType: string;
	sizeBytes: number | null;
	/** Paperless title and date (YYYY-MM-DD), for meta defaults. Null for uploads. */
	upstreamTitle: string | null;
	upstreamDate: string | null;
}

export type DocumentMeta = {
	title: string;
	category: DocumentCategory;
	documentDate: string | null;
	healthEventId: string | null;
	originalName: string | null;
	uploadedBy: string;
};

function documentKey(companionId: string, filename: string): string {
	return `documents/${companionId}/${filename}`;
}

export async function prepareUpload(
	file: File | null
): Promise<
	| { ok: true; prepared: PreparedDocument }
	| { ok: false; error: 'noFile' | 'invalidType' | 'tooLarge' }
> {
	if (!file || file.size === 0) return { ok: false, error: 'noFile' };
	if (!isAllowedDocumentMime(file.type)) return { ok: false, error: 'invalidType' };
	if (file.size > MAX_DOCUMENT_SIZE) return { ok: false, error: 'tooLarge' };

	const raw = Buffer.from(await file.arrayBuffer());
	// Reject mislabeled bytes before trusting the client mime (PDFs are
	// stored as-is; HTML-prefix polyglots must die here).
	if (!looksLikeDocument(raw, file.type)) return { ok: false, error: 'invalidType' };

	let body: Buffer;
	let mimeType: string;
	if (file.type === 'application/pdf') {
		// PDFs cannot be re-encoded; stored as-is. Serving-side hardening
		// (CSP sandbox, nosniff, DB-row content type) covers them.
		body = raw;
		mimeType = 'application/pdf';
	} else if (file.type === 'image/png') {
		// Lossless re-encode: launders structure, strips EXIF, keeps receipts
		// crisp. Larger resize cap than journal photos: these must stay legible.
		try {
			body = await sharp(raw, { limitInputPixels: MAX_DECODE_PIXELS })
				.resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
				.png()
				.toBuffer();
		} catch {
			return { ok: false, error: 'invalidType' };
		}
		mimeType = 'image/png';
	} else {
		// jpeg / webp / heic -> JPEG q90. Also converts HEIC to a universally
		// renderable format. sharp without libheif throws on HEIC: surface as
		// invalid file type rather than a 500.
		try {
			body = await sharp(raw, { limitInputPixels: MAX_DECODE_PIXELS })
				.rotate()
				.resize(4096, 4096, { fit: 'inside', withoutEnlargement: true })
				.jpeg({ quality: 90 })
				.toBuffer();
		} catch {
			return { ok: false, error: 'invalidType' };
		}
		mimeType = 'image/jpeg';
	}

	return {
		ok: true,
		prepared: {
			body,
			mimeType,
			originalName: (file.name || '').slice(0, 255) || null,
			fileName: file.name || ''
		}
	};
}

/** Generates the id and filename and writes the object. Throws if storage fails. */
export async function storePrepared(
	companionId: string,
	prepared: PreparedDocument
): Promise<StoredDocument> {
	const id = generateId(15);
	const filename = `${id}.${documentExtFromMime(prepared.mimeType)}`;
	const storageKey = documentKey(companionId, filename);
	await getStorage().put({ key: storageKey, body: prepared.body, contentType: prepared.mimeType });
	return {
		id,
		filename,
		provider: STORAGE_BACKEND,
		storageKey,
		mimeType: prepared.mimeType,
		sizeBytes: prepared.body.length,
		upstreamTitle: null,
		upstreamDate: null
	};
}

export async function preparePaperless(
	paperlessId: string
): Promise<
	| { ok: true; stored: StoredDocument }
	| { ok: false; error: 'notConfigured' | 'invalid' | 'notFound' | 'invalidType' }
> {
	const client = getPaperlessClient();
	if (!client || !PAPERLESS_CONFIG) return { ok: false, error: 'notConfigured' };
	if (!PAPERLESS_DOC_ID_RE.test(paperlessId)) return { ok: false, error: 'invalid' };

	const doc = await client.getDocument(paperlessId);
	if (!doc) return { ok: false, error: 'notFound' };

	// The import endpoint is the security boundary; the picker is advisory.
	// Enforce the tag scope here even though the search proxy also filters.
	if (PAPERLESS_CONFIG.tagId !== null && !doc.tags.includes(PAPERLESS_CONFIG.tagId)) {
		return { ok: false, error: 'notFound' };
	}

	// We serve the archived version (always PDF) when Paperless has one;
	// otherwise the original must itself be an allowed type.
	const mimeType = doc.hasArchiveVersion ? 'application/pdf' : doc.originalMimeType;
	if (!isAllowedDocumentMime(mimeType)) return { ok: false, error: 'invalidType' };

	const id = generateId(15);
	// Ext matches what we actually serve: pdf for archived versions, the
	// original's ext for the rare no-archive case.
	const filename = `${id}.${documentExtFromMime(mimeType)}`;
	// Paperless `created` is an ISO datetime; keep the date part, but don't
	// trust upstream format blindly.
	const createdDate = doc.created?.slice(0, 10) ?? '';
	return {
		ok: true,
		stored: {
			id,
			filename,
			provider: 'paperless',
			storageKey: paperlessKey(paperlessId),
			mimeType,
			sizeBytes: null,
			upstreamTitle: doc.title || null,
			upstreamDate: isValidDate(createdDate) ? createdDate : null
		}
	};
}

/**
 * Cap check and insert inside the caller's (immediate) transaction, so two
 * concurrent uploads cannot both pass the cap. A Paperless document already
 * on this companion returns the existing row's id (double-click guard).
 */
export function insertDocumentRow(
	tx: Tx,
	companionId: string,
	stored: StoredDocument,
	meta: DocumentMeta
): 'inserted' | 'capReached' | { existingId: string } {
	if (stored.provider === 'paperless') {
		const dupe = tx
			.select({ id: schema.documents.id })
			.from(schema.documents)
			.where(
				and(
					eq(schema.documents.companionId, companionId),
					eq(schema.documents.storageKey, stored.storageKey)
				)
			)
			.all();
		if (dupe.length > 0) return { existingId: dupe[0].id };
	}
	const rows = tx
		.select({ value: count() })
		.from(schema.documents)
		.where(eq(schema.documents.companionId, companionId))
		.all();
	if ((rows[0]?.value ?? 0) >= MAX_DOCUMENTS_PER_COMPANION) return 'capReached';
	tx.insert(schema.documents)
		.values({
			id: stored.id,
			companionId,
			healthEventId: meta.healthEventId,
			filename: stored.filename,
			provider: stored.provider,
			storageKey: stored.storageKey,
			title: meta.title,
			category: meta.category,
			documentDate: meta.documentDate,
			originalName: meta.originalName,
			mimeType: stored.mimeType,
			sizeBytes: stored.sizeBytes,
			uploadedBy: meta.uploadedBy
		})
		.run();
	return 'inserted';
}

/** Removes the stored object after a failed insert. Paperless has none. */
export async function discardStored(stored: StoredDocument): Promise<void> {
	if (stored.provider === 'paperless') return;
	await getStorage(stored.provider)
		.delete(stored.storageKey)
		.catch((err) =>
			console.warn(`[documents] orphan cleanup failed for ${stored.storageKey}:`, err)
		);
}
