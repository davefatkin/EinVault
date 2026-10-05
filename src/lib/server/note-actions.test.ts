import { describe, it, expect } from 'vitest';
import { noteFieldsFromForm, noteFormValues } from './note-actions';

function form(entries: [string, string][]): FormData {
	const data = new FormData();
	for (const [k, v] of entries) data.append(k, v);
	return data;
}

describe('noteFormValues', () => {
	it('keeps pending tag text apart from the committed tags', () => {
		const data = form([
			['title', 'T'],
			['body', 'B'],
			['tags', 'food'],
			['tags', 'walks'],
			['tagsPending', 'way too long, vet'],
			['shared', 'on']
		]);
		expect(noteFormValues(data)).toEqual({
			title: 'T',
			body: 'B',
			tags: ['food', 'walks'],
			tagsPending: 'way too long, vet',
			pinned: false,
			sharedWithCaretakers: true
		});
	});

	it('defaults missing fields', () => {
		expect(noteFormValues(form([]))).toEqual({
			title: '',
			body: '',
			tags: [],
			tagsPending: '',
			pinned: false,
			sharedWithCaretakers: false
		});
	});
});

describe('noteFieldsFromForm', () => {
	it('counts pending tag text as tags', () => {
		const data = form([
			['title', 'T'],
			['tags', 'food'],
			['tagsPending', ' vet, walks '],
			['pinned', 'on']
		]);
		expect(noteFieldsFromForm(data)).toEqual({
			title: 'T',
			body: '',
			tags: ['food', 'vet', 'walks'],
			pinned: true,
			sharedWithCaretakers: false
		});
	});
});
