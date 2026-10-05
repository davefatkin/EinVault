import { describe, it, expect, beforeAll } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db';
import { createNote } from '$lib/server/notes';
import { NoteCreate, NoteUpdate } from '$lib/server/openapi/schemas';
import { NOTE_BODY_MAX_LEN, NOTE_MAX_TAGS, NOTE_TITLE_MAX_LEN } from '$lib/notes';
import {
	loadAllowedNote,
	noteCodeFor,
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

async function caughtAsync(fn: () => Promise<unknown>) {
	try {
		await fn();
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
		expect(caught(() => parsePinnedParam('yes', 'en'))).toEqual({
			status: 400,
			body: { code: 'invalidPinned', message: 'pinned must be "true" or "false".' }
		});
	});
});

describe('loadAllowedNote', () => {
	const ACTIVE = 'c-notes-api-active';
	const ARCHIVED = 'c-notes-api-archived';
	const member = { id: 'u-notes-api', role: 'member' as const };
	const fields = { body: '', tags: [], pinned: false, sharedWithCaretakers: false };
	let activeNote: string;
	let archivedNote: string;

	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: ACTIVE, name: 'Rex' },
			{ id: ARCHIVED, name: 'Bo', isActive: false }
		]);
		await db
			.insert(schema.users)
			.values({ ...member, username: 'notesapi', displayName: 'Jet', passwordHash: 'x' });
		activeNote = await createNote(ACTIVE, { ...fields, title: 'Visible' }, member.id);
		archivedNote = await createNote(ARCHIVED, { ...fields, title: 'Hidden' }, member.id);
	});

	it('returns a note on a companion the user can access', async () => {
		const note = await loadAllowedNote(activeNote, member, 'en');
		expect(note).toMatchObject({ id: activeNote, companionId: ACTIVE, title: 'Visible' });
	});

	it('reads a note on an archived companion as 404', async () => {
		expect(await caughtAsync(() => loadAllowedNote(archivedNote, member, 'en'))).toEqual({
			status: 404,
			body: { code: 'notFound', message: 'Note not found.' }
		});
	});

	it('reads an unknown id as 404', async () => {
		expect(await caughtAsync(() => loadAllowedNote('no-such-note', member, 'en'))).toEqual({
			status: 404,
			body: { code: 'notFound', message: 'Note not found.' }
		});
	});
});

describe('noteCodeFor', () => {
	function firstIssue(schemaToUse: typeof NoteCreate | typeof NoteUpdate, input: unknown) {
		const parsed = schemaToUse.safeParse(input);
		if (parsed.success) throw new Error('expected a parse failure');
		return parsed.error.issues[0];
	}
	const base = { companionId: 'c1', title: 'ok' };

	it('maps length and count failures to the validator codes', () => {
		expect(
			noteCodeFor(
				firstIssue(NoteCreate, { ...base, title: 'a'.repeat(NOTE_TITLE_MAX_LEN + 1) }),
				'en'
			)
		).toEqual({ code: 'titleTooLong', message: 'Title is too long (max 200 characters).' });
		expect(
			noteCodeFor(
				firstIssue(NoteCreate, { ...base, body: 'a'.repeat(NOTE_BODY_MAX_LEN + 1) }),
				'en'
			)
		).toMatchObject({ code: 'bodyTooLong' });
		expect(
			noteCodeFor(
				firstIssue(NoteUpdate, {
					tags: Array.from({ length: NOTE_MAX_TAGS + 1 }, (_, i) => `t${i}`)
				}),
				'en'
			)
		).toEqual({ code: 'tooManyTags', message: 'Too many tags (max 10).' });
	});

	it('leaves other shape failures to invalidBody', () => {
		expect(noteCodeFor(firstIssue(NoteCreate, { title: 'no companion' }), 'en')).toBeUndefined();
		expect(noteCodeFor(firstIssue(NoteCreate, { ...base, title: 5 }), 'en')).toBeUndefined();
		expect(noteCodeFor(firstIssue(NoteCreate, { ...base, extra: true }), 'en')).toBeUndefined();
		expect(
			noteCodeFor(firstIssue(NoteUpdate, { tags: [''], pinned: 'yes' }), 'en')
		).toBeUndefined();
	});
});

describe('note title length after trimming', () => {
	const title = 'a'.repeat(NOTE_TITLE_MAX_LEN) + ' ';

	it('accepts a max-length title with surrounding whitespace, like the form', () => {
		expect(NoteCreate.safeParse({ companionId: 'c1', title }).success).toBe(true);
		expect(NoteUpdate.safeParse({ title: ` ${title}` }).success).toBe(true);
	});

	it('still rejects a title that is too long once trimmed', () => {
		const long = 'a'.repeat(NOTE_TITLE_MAX_LEN + 1);
		expect(NoteCreate.safeParse({ companionId: 'c1', title: long }).success).toBe(false);
		expect(NoteUpdate.safeParse({ title: long }).success).toBe(false);
	});
});
