import { describe, it, expect } from 'vitest';
import { commitTags, matchSuggestions, splitTagText } from './commit';

const normalize = (raw: string) => {
	const tag = raw.trim().toLowerCase();
	return tag.length === 0 || tag.length > 5 ? null : tag;
};
const opts = { max: 3, normalize };

describe('splitTagText', () => {
	it('splits on commas and drops empty parts', () => {
		expect(splitTagText(' a, b ,, c,')).toEqual(['a', 'b', 'c']);
		expect(splitTagText(' , ')).toEqual([]);
	});
});

describe('commitTags', () => {
	it('adds normalized tags', () => {
		expect(commitTags([], ['Food', 'walk'], opts)).toEqual({
			tags: ['food', 'walk'],
			rest: [],
			error: null
		});
	});

	it('skips duplicates without an error', () => {
		expect(commitTags(['food'], ['FOOD'], opts)).toEqual({
			tags: ['food'],
			rest: [],
			error: null
		});
	});

	it('keeps invalid text and reports it', () => {
		expect(commitTags(['a'], ['toolong'], opts)).toEqual({
			tags: ['a'],
			rest: ['toolong'],
			error: 'invalid'
		});
	});

	it('adds the valid parts of a mixed paste and keeps the rest', () => {
		expect(commitTags([], ['ok', 'toolong', 'fine'], opts)).toEqual({
			tags: ['ok', 'fine'],
			rest: ['toolong'],
			error: 'invalid'
		});
	});

	it('keeps parts past the limit', () => {
		expect(commitTags(['a', 'b'], ['c', 'd', 'e'], opts)).toEqual({
			tags: ['a', 'b', 'c'],
			rest: ['d', 'e'],
			error: 'tooMany'
		});
	});

	it('reports the first problem when there are several', () => {
		expect(commitTags(['a', 'b', 'c'], ['d', 'toolong'], opts).error).toBe('tooMany');
		expect(commitTags(['a', 'b', 'c'], ['toolong', 'd'], opts).error).toBe('invalid');
	});

	it('does not mutate the current list', () => {
		const current = ['a'];
		commitTags(current, ['b'], opts);
		expect(current).toEqual(['a']);
	});
});

describe('matchSuggestions', () => {
	const all = ['food', 'fun', 'walk', 'vet'];

	it('lists unused suggestions when the text is empty', () => {
		expect(matchSuggestions(all, ['vet'], '  ', normalize)).toEqual(['food', 'fun', 'walk']);
	});

	it('filters by prefix of the normalized text', () => {
		expect(matchSuggestions(all, [], ' F', normalize)).toEqual(['food', 'fun']);
	});

	it('matches nothing when the text cannot be a tag', () => {
		expect(matchSuggestions(all, [], 'toolong', normalize)).toEqual([]);
	});

	it('caps the list', () => {
		expect(matchSuggestions(all, [], '', normalize, 2)).toEqual(['food', 'fun']);
	});
});
