import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./documentsApi.js', () => ({
	unlinkDocument: vi.fn(),
	attachDocument: vi.fn(),
	importAndAttach: vi.fn(),
	uploadDocument: vi.fn()
}));

import { unlinkDocument, attachDocument, importAndAttach, uploadDocument } from './documentsApi.js';
import { applyAttachments, emptyPending, addPaperlessPick } from './healthAttachments.js';

const ok = { ok: true as const, value: null };
const base = { companionId: 'c1', healthEventId: 'h1', day: '2026-01-02', locale: 'en' as const };

beforeEach(() => {
	vi.mocked(unlinkDocument).mockReset().mockResolvedValue(ok);
	vi.mocked(attachDocument).mockReset().mockResolvedValue(ok);
	vi.mocked(importAndAttach).mockReset().mockResolvedValue(ok);
	vi.mocked(uploadDocument)
		.mockReset()
		.mockResolvedValue({ ok: true, value: { id: 'n', title: 'x', documentDate: null } });
});

describe('applyAttachments', () => {
	it('applies nothing and makes no calls when nothing is pending', async () => {
		expect(await applyAttachments({ ...base, pending: emptyPending(), titles: {} })).toEqual([]);
		expect(unlinkDocument).not.toHaveBeenCalled();
		expect(attachDocument).not.toHaveBeenCalled();
		expect(importAndAttach).not.toHaveBeenCalled();
		expect(uploadDocument).not.toHaveBeenCalled();
	});

	it('runs unlinks, links, Paperless picks, then uploads, all with the event id, day and category', async () => {
		const order: string[] = [];
		vi.mocked(unlinkDocument).mockImplementation(async () => (order.push('unlink'), ok));
		vi.mocked(attachDocument).mockImplementation(async () => (order.push('link'), ok));
		vi.mocked(importAndAttach).mockImplementation(async () => (order.push('paperless'), ok));
		vi.mocked(uploadDocument).mockImplementation(
			async () => (
				order.push('upload'),
				{ ok: true, value: { id: 'n', title: 'x', documentDate: null } }
			)
		);
		const file = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' });
		const pending = {
			files: [file],
			paperless: [{ paperlessId: 7, title: 'Vet bill' }],
			linkIds: ['d2'],
			unlinkIds: ['d1'],
			category: 'receipt' as const
		};
		expect(await applyAttachments({ ...base, pending, titles: {} })).toEqual([]);
		expect(order).toEqual(['unlink', 'link', 'paperless', 'upload']);
		expect(unlinkDocument).toHaveBeenCalledWith('c1', 'd1', 'h1', 'en');
		expect(attachDocument).toHaveBeenCalledWith('c1', 'd2', 'h1', 'en');
		expect(importAndAttach).toHaveBeenCalledWith('c1', 7, 'h1', 'en', { category: 'receipt' });
		expect(uploadDocument).toHaveBeenCalledWith(
			'c1',
			file,
			{ healthEventId: 'h1', documentDate: '2026-01-02', category: 'receipt' },
			'en'
		);
	});

	it('names each failure by title or file name and keeps going', async () => {
		vi.mocked(unlinkDocument).mockResolvedValue({ ok: false, message: 'u' });
		vi.mocked(attachDocument).mockResolvedValue({ ok: false, message: 'Already attached to X' });
		vi.mocked(importAndAttach).mockResolvedValue({ ok: false, message: 'p' });
		vi.mocked(uploadDocument).mockResolvedValue({ ok: false, message: 'f' });
		const pending = {
			files: [new File(['x'], 'a.pdf')],
			paperless: [{ paperlessId: 7, title: 'Vet bill' }],
			linkIds: ['d2', 'd3'],
			unlinkIds: ['d1'],
			category: 'invoice' as const
		};
		expect(
			await applyAttachments({ ...base, pending, titles: { d1: 'Old scan', d2: 'Lab' } })
		).toEqual([
			{ name: 'Old scan', message: 'u' },
			{ name: 'Lab', message: 'Already attached to X' },
			{ name: 'd3', message: 'Already attached to X' },
			{ name: 'Vet bill', message: 'p' },
			{ name: 'a.pdf', message: 'f' }
		]);
	});
});

describe('addPaperlessPick', () => {
	it('ignores a document already picked', () => {
		const p1 = addPaperlessPick(emptyPending(), { paperlessId: 7, title: 'A' });
		const p2 = addPaperlessPick(p1, { paperlessId: 7, title: 'A again' });
		expect(p2.paperless).toEqual([{ paperlessId: 7, title: 'A' }]);
		expect(addPaperlessPick(p2, { paperlessId: 8, title: 'B' }).paperless).toHaveLength(2);
	});
});
