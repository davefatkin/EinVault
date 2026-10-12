import { describe, it, expect } from 'vitest';
import { photoSelection, sheetPhotoIds, type SheetMedia, type SheetNote } from './caretakerSheet';

const media = (id: string, mediaType: SheetMedia['mediaType'] = 'photo'): SheetMedia => ({
	id,
	filename: `${id}.jpg`,
	originalName: null,
	mediaType,
	caption: null
});
const note = (id: string, items: SheetMedia[]): SheetNote => ({
	id,
	title: id,
	body: '',
	pinned: false,
	tags: [],
	media: items
});

describe('sheetPhotoIds', () => {
	it('lists photos across notes in order and skips videos', () => {
		const notes = [
			note('a', [media('p1'), media('v1', 'video')]),
			note('b', []),
			note('c', [media('p2')])
		];
		expect(sheetPhotoIds({ notes })).toEqual(['p1', 'p2']);
	});

	it('is empty when the only media are videos', () => {
		expect(sheetPhotoIds({ notes: [note('a', [media('v1', 'video')])] })).toEqual([]);
	});
});

describe('photoSelection', () => {
	const ids = ['p1', 'p2', 'p3'];

	it('is all when nothing is excluded', () => {
		expect(photoSelection(ids, new Set())).toEqual({ included: 3, total: 3, state: 'all' });
	});

	it('is some when part is excluded', () => {
		expect(photoSelection(ids, new Set(['p2', 'p3']))).toEqual({
			included: 1,
			total: 3,
			state: 'some'
		});
	});

	it('is none when every photo is excluded', () => {
		expect(photoSelection(ids, new Set(ids))).toEqual({ included: 0, total: 3, state: 'none' });
	});

	it('ignores excluded ids that are not photos on the sheet', () => {
		expect(photoSelection(ids, new Set(['note-1', 'v1']))).toEqual({
			included: 3,
			total: 3,
			state: 'all'
		});
	});

	it('is none with no photos', () => {
		expect(photoSelection([], new Set())).toEqual({ included: 0, total: 0, state: 'none' });
	});
});
