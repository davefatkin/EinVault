import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import sharp from 'sharp';
import { db, schema } from '#lib/server/db/index.js';
import { MAX_DOCUMENTS_PER_COMPANION, UPLOAD_MAX_MB } from '#lib/server/env.js';
import { paperlessKey } from '#lib/server/storage/index.js';
import { prepareUpload, insertDocumentRow, type StoredDocument } from './documents';

const C1 = 'c-doc-1';
const C2 = 'c-doc-2';
const U1 = 'u-doc-1';

const meta = {
	title: 'Receipt',
	category: 'receipt' as const,
	documentDate: null,
	healthEventId: null,
	originalName: null,
	uploadedBy: U1
};

let n = 0;
function stored(over: Partial<StoredDocument> = {}): StoredDocument {
	const id = `d-doc-${++n}`;
	return {
		id,
		filename: `${id}.pdf`,
		provider: 'local',
		storageKey: `documents/x/${id}.pdf`,
		mimeType: 'application/pdf',
		sizeBytes: 10,
		upstreamTitle: null,
		upstreamDate: null,
		...over
	};
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Rex' },
		{ id: C2, name: 'Bo' }
	]);
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'd1', displayName: 'Jet', role: 'member', passwordHash: 'x' });
});

beforeEach(async () => {
	await db.delete(schema.documents);
});

describe('prepareUpload', () => {
	it('rejects a missing or empty file', async () => {
		expect(await prepareUpload(null)).toEqual({ ok: false, error: 'noFile' });
		expect(await prepareUpload(new File([], 'a.pdf', { type: 'application/pdf' }))).toEqual({
			ok: false,
			error: 'noFile'
		});
	});

	it('rejects a disallowed mime type', async () => {
		const f = new File(['x'], 'a.txt', { type: 'text/plain' });
		expect(await prepareUpload(f)).toEqual({ ok: false, error: 'invalidType' });
	});

	it('rejects HTML labeled as a PDF', async () => {
		const f = new File(['<html><script>1</script></html>'], 'a.pdf', {
			type: 'application/pdf'
		});
		expect(await prepareUpload(f)).toEqual({ ok: false, error: 'invalidType' });
	});

	it('rejects an oversized file', async () => {
		const f = new File([new Uint8Array(UPLOAD_MAX_MB * 1024 * 1024 + 1)], 'a.pdf', {
			type: 'application/pdf'
		});
		expect(await prepareUpload(f)).toEqual({ ok: false, error: 'tooLarge' });
	});

	it('accepts a small PNG and re-encodes it', async () => {
		const png = await sharp({
			create: { width: 4, height: 4, channels: 3, background: '#fff' }
		})
			.png()
			.toBuffer();
		const r = await prepareUpload(new File([new Uint8Array(png)], 'r.png', { type: 'image/png' }));
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.prepared.mimeType).toBe('image/png');
			expect(r.prepared.originalName).toBe('r.png');
		}
	});
});

describe('insertDocumentRow', () => {
	it('inserts a row', () => {
		const s = stored();
		expect(db.transaction((tx) => insertDocumentRow(tx, C1, s, meta))).toBe('inserted');
	});

	it('returns capReached at the per-companion cap', async () => {
		await db.insert(schema.documents).values(
			Array.from({ length: MAX_DOCUMENTS_PER_COMPANION }, (_, i) => ({
				id: `fill-${i}`,
				companionId: C1,
				filename: `fill-${i}.pdf`,
				storageKey: `k-${i}`,
				title: 't',
				mimeType: 'application/pdf'
			}))
		);
		const s = stored();
		expect(db.transaction((tx) => insertDocumentRow(tx, C1, s, meta))).toBe('capReached');
		// Other companions are unaffected.
		expect(db.transaction((tx) => insertDocumentRow(tx, C2, stored(), meta))).toBe('inserted');
	});

	it('returns the existing id for a Paperless duplicate on the same companion', () => {
		const pl = () =>
			stored({
				provider: 'paperless',
				storageKey: paperlessKey('42'),
				sizeBytes: null
			});
		const first = pl();
		expect(db.transaction((tx) => insertDocumentRow(tx, C1, first, meta))).toBe('inserted');
		expect(db.transaction((tx) => insertDocumentRow(tx, C1, pl(), meta))).toEqual({
			existingId: first.id
		});
		expect(db.transaction((tx) => insertDocumentRow(tx, C2, pl(), meta))).toBe('inserted');
	});
});
