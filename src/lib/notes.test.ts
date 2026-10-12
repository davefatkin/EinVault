import { describe, it, expect } from 'vitest';
import {
	normalizeTag,
	normalizeTags,
	splitTagInput,
	validateNewNote,
	validateNotePatch,
	buildTagFilter,
	parseTagFilter,
	tagFilterMatchesNothing,
	notesFilterHref,
	NOTE_FILTER_MAX_TAGS,
	NOTE_MAX_TAGS,
	NOTE_TAG_MAX_LEN,
	NOTE_TITLE_MAX_LEN,
	NOTE_BODY_MAX_LEN
} from './notes';

describe('normalizeTag', () => {
	it('trims, lowercases and collapses inner whitespace', () => {
		expect(normalizeTag('  Hand   Signals ')).toBe('hand signals');
	});
	it('rejects empty and over-length tags', () => {
		expect(normalizeTag('   ')).toBeNull();
		expect(normalizeTag('x'.repeat(NOTE_TAG_MAX_LEN))).toBe('x'.repeat(NOTE_TAG_MAX_LEN));
		expect(normalizeTag('x'.repeat(NOTE_TAG_MAX_LEN + 1))).toBeNull();
	});
	it('keeps non-ASCII text', () => {
		expect(normalizeTag('Comandos Básicos')).toBe('comandos básicos');
		expect(normalizeTag('犬のごはん')).toBe('犬のごはん');
	});
});

describe('normalizeTags', () => {
	it('de-duplicates after normalizing, keeping first-seen order', () => {
		expect(normalizeTags(['Food', ' food ', 'FOOD', 'walks'])).toEqual({
			tags: ['food', 'walks'],
			invalid: false
		});
	});
	it('flags any invalid entry', () => {
		expect(normalizeTags(['ok', '  ']).invalid).toBe(true);
	});
});

describe('splitTagInput', () => {
	it('splits pasted comma-separated text', () => {
		expect(splitTagInput('food, treats,  walks,')).toEqual(['food', 'treats', 'walks']);
	});
	it('returns nothing for blank input', () => {
		expect(splitTagInput('  ,  ')).toEqual([]);
	});
});

describe('validateNewNote', () => {
	const base = { title: 'Commands', body: '- sit', tags: ['Training'] };

	it('normalizes and fills defaults', () => {
		expect(validateNewNote(base)).toEqual({
			ok: true,
			value: {
				title: 'Commands',
				body: '- sit',
				tags: ['training'],
				pinned: false,
				sharedWithCaretakers: false
			}
		});
	});
	it('trims the title and rejects a whitespace-only one', () => {
		expect(validateNewNote({ ...base, title: '  Food  ' })).toMatchObject({
			ok: true,
			value: { title: 'Food' }
		});
		expect(validateNewNote({ ...base, title: '   ' })).toEqual({
			ok: false,
			code: 'titleRequired'
		});
		expect(validateNewNote({ body: 'x' })).toEqual({ ok: false, code: 'titleRequired' });
	});
	it('rejects line breaks and over-length titles', () => {
		expect(validateNewNote({ ...base, title: 'a\nb' })).toEqual({
			ok: false,
			code: 'invalidTitle'
		});
		expect(validateNewNote({ ...base, title: 'a\rb' })).toEqual({
			ok: false,
			code: 'invalidTitle'
		});
		expect(validateNewNote({ ...base, title: 'x'.repeat(NOTE_TITLE_MAX_LEN + 1) })).toEqual({
			ok: false,
			code: 'titleTooLong'
		});
	});
	it('rejects an over-length body', () => {
		expect(validateNewNote({ ...base, body: 'x'.repeat(NOTE_BODY_MAX_LEN + 1) })).toEqual({
			ok: false,
			code: 'bodyTooLong'
		});
	});
	it('enforces the tag count after de-duplication', () => {
		const many = Array.from({ length: NOTE_MAX_TAGS + 1 }, (_, i) => `t${i}`);
		expect(validateNewNote({ ...base, tags: many })).toEqual({ ok: false, code: 'tooManyTags' });
		const dupes = [...Array.from({ length: NOTE_MAX_TAGS }, (_, i) => `t${i}`), 'T0'];
		expect(validateNewNote({ ...base, tags: dupes }).ok).toBe(true);
	});
	it('rejects an invalid tag', () => {
		expect(validateNewNote({ ...base, tags: ['ok', ''] })).toEqual({
			ok: false,
			code: 'invalidTag'
		});
	});
});

describe('validateNotePatch', () => {
	it('keeps only the provided fields', () => {
		expect(validateNotePatch({ pinned: true })).toEqual({ ok: true, value: { pinned: true } });
	});
	it('validates provided fields with the same rules', () => {
		expect(validateNotePatch({ title: '  ' })).toEqual({ ok: false, code: 'titleRequired' });
		expect(validateNotePatch({ tags: ['A', 'a'] })).toEqual({ ok: true, value: { tags: ['a'] } });
	});
});

describe('parseTagFilter', () => {
	it('defaults to no tags and any', () => {
		expect(parseTagFilter([], null)).toEqual({
			ok: true,
			value: { rawCount: 0, tags: [], invalid: false, match: 'any' }
		});
	});
	it('normalizes and de-duplicates, keeping the raw count', () => {
		expect(parseTagFilter(['Food', ' food ', 'Walks'], 'all')).toEqual({
			ok: true,
			value: { rawCount: 3, tags: ['food', 'walks'], invalid: false, match: 'all' }
		});
	});
	it('flags an invalid tag but keeps the valid ones', () => {
		expect(parseTagFilter(['food', 'x'.repeat(33)], 'any')).toEqual({
			ok: true,
			value: { rawCount: 2, tags: ['food'], invalid: true, match: 'any' }
		});
	});
	it('accepts only exactly any or all', () => {
		expect(parseTagFilter(['a'], 'any').ok).toBe(true);
		for (const bad of ['', 'ALL', 'Any', 'bogus']) {
			expect(parseTagFilter(['a'], bad)).toEqual({ ok: false, code: 'invalidMatch' });
		}
	});
	it('validates match even without tags', () => {
		expect(parseTagFilter([], 'bogus')).toEqual({ ok: false, code: 'invalidMatch' });
	});
	it('caps raw tag values, counting duplicates', () => {
		expect(parseTagFilter(Array(NOTE_FILTER_MAX_TAGS).fill('a'), null).ok).toBe(true);
		expect(parseTagFilter(Array(NOTE_FILTER_MAX_TAGS + 1).fill('a'), null)).toEqual({
			ok: false,
			code: 'tooManyFilterTags'
		});
	});
});

describe('buildTagFilter', () => {
	it('never fails', () => {
		expect(buildTagFilter(['Food', '  '], 'all')).toEqual({
			rawCount: 2,
			tags: ['food'],
			invalid: true,
			match: 'all'
		});
	});
});

describe('tagFilterMatchesNothing', () => {
	const f = (rawTags: string[], match: 'any' | 'all') => buildTagFilter(rawTags, match);
	it('is false with no filter', () => {
		expect(tagFilterMatchesNothing(f([], 'any'))).toBe(false);
	});
	it('is true when every requested tag is invalid', () => {
		expect(tagFilterMatchesNothing(f(['x'.repeat(33)], 'any'))).toBe(true);
		expect(tagFilterMatchesNothing(f(['  ', ''], 'all'))).toBe(true);
	});
	it('is true for all with an invalid tag among several', () => {
		expect(tagFilterMatchesNothing(f(['food', 'x'.repeat(33)], 'all'))).toBe(true);
	});
	it('is false for any with an invalid tag among several', () => {
		expect(tagFilterMatchesNothing(f(['food', 'x'.repeat(33)], 'any'))).toBe(false);
	});
	it('is false for all with duplicate valid tags', () => {
		expect(tagFilterMatchesNothing(f(['food', 'Food'], 'all'))).toBe(false);
	});
});

describe('notesFilterHref', () => {
	const base = '/c1/notes';
	it('is the bare list with no tags', () => {
		expect(notesFilterHref(base, [], 'all')).toBe(base);
	});
	it('writes one tag param per tag, in order', () => {
		expect(notesFilterHref(base, ['b', 'a'], 'any')).toBe(`${base}?tag=b&tag=a`);
	});
	it('writes match=all only with two or more tags', () => {
		expect(notesFilterHref(base, ['a', 'b'], 'all')).toBe(`${base}?tag=a&tag=b&match=all`);
		expect(notesFilterHref(base, ['a'], 'all')).toBe(`${base}?tag=a`);
	});
	it('round-trips tags with spaces and symbols', () => {
		const href = notesFilterHref(base, ['hand signals', 'a&b'], 'any');
		expect(new URL(href, 'http://x').searchParams.getAll('tag')).toEqual(['hand signals', 'a&b']);
	});
});
