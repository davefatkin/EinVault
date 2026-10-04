import { describe, it, expect } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import {
	parsePinnedParam,
	requireNoteOwnerScope,
	throwNoteError,
	throwNoteNotFound
} from './notes-api';

function caught(fn: () => unknown) {
	try {
		fn();
	} catch (e) {
		if (isHttpError(e)) return { status: e.status, body: e.body };
		throw e;
	}
	return null;
}

describe('notes api guards', () => {
	it('rejects write-scope tokens and caretakers with 403', () => {
		expect(caught(() => requireNoteOwnerScope('write', { role: 'member' }, 'en'))?.status).toBe(
			403
		);
		expect(caught(() => requireNoteOwnerScope('full', { role: 'caretaker' }, 'en'))).toMatchObject({
			status: 403,
			body: { code: 'forbidden' }
		});
		expect(caught(() => requireNoteOwnerScope('full', { role: 'member' }, 'en'))).toBeNull();
	});

	it('maps note error codes to 400 with a localized message', () => {
		expect(caught(() => throwNoteError('tooManyTags', 'en'))).toEqual({
			status: 400,
			body: { code: 'tooManyTags', message: 'Too many tags (max 10).' }
		});
	});

	it('maps a missing note to a localized 404', () => {
		expect(caught(() => throwNoteNotFound('en'))).toEqual({
			status: 404,
			body: { code: 'notFound', message: 'Note not found.' }
		});
	});

	it('parses the pinned filter', () => {
		expect(parsePinnedParam(null, 'en')).toBeUndefined();
		expect(parsePinnedParam('true', 'en')).toBe(true);
		expect(parsePinnedParam('false', 'en')).toBe(false);
		expect(caught(() => parsePinnedParam('yes', 'en'))?.status).toBe(400);
	});
});
