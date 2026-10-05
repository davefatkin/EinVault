import { describe, it, expect } from 'vitest';
import {
	normalizeTag,
	normalizeTags,
	splitTagInput,
	validateNewNote,
	validateNotePatch,
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
