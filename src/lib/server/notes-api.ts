import { error } from '@sveltejs/kit';
import type { z } from 'zod';
import { t, type Locale } from '#lib/i18n/index.js';
import {
	NOTE_ERROR,
	NOTE_FILTER_MAX_TAGS,
	parseTagFilter,
	type NoteErrorCode,
	type TagFilter
} from '#lib/notes.js';
import { requireFullScope } from '#lib/server/api-guards.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import { getNote, type NoteWithAuthors } from '#lib/server/notes.js';
import type { ApiTokenScope } from '#lib/server/api-tokens.js';
import type { UserRole } from '#lib/server/validation.js';

// Shared guards for /api/notes. Notes are owner data: write-scope tokens and
// caretakers get 403 (caretakers read shared notes on the care page only).
export function requireNoteOwnerScope(
	scope: ApiTokenScope,
	user: { role: UserRole },
	locale: Locale
): void {
	requireFullScope(scope, locale);
	if (user.role === 'caretaker')
		error(403, { code: 'forbidden', message: t(locale, 'error.forbidden') });
}

// A missing note and a note on a companion the token can't access (archived)
// both read as 404, so ids can't be probed.
export async function loadAllowedNote(
	id: string,
	user: { id: string; role: UserRole },
	locale: Locale
): Promise<NoteWithAuthors> {
	const note = await getNote(id);
	const allowed = note && (await listAllowedCompanions(user)).includes(note.companionId);
	if (!note || !allowed) throwNoteNotFound(locale);
	return note;
}

export function throwNoteNotFound(locale: Locale): never {
	error(404, { code: 'notFound', message: t(locale, 'error.noteNotFound') });
}

export function throwNoteError(code: NoteErrorCode, locale: Locale): never {
	const { key, params } = NOTE_ERROR[code];
	error(400, { code, message: t(locale, key, params) });
}

// Maps zod shape failures on NoteCreate/NoteUpdate to the same codes the
// validators use, so clients see one vocabulary.
export function noteCodeFor(
	issue: z.core.$ZodIssue,
	locale: Locale
): { code: string; message: string } | undefined {
	const field = issue.path[0];
	const map: Record<string, NoteErrorCode> = {
		title: 'titleTooLong',
		body: 'bodyTooLong',
		tags: 'tooManyTags'
	};
	if (issue.code === 'too_big' && typeof field === 'string' && map[field]) {
		const code = map[field];
		const { key, params } = NOTE_ERROR[code];
		return { code, message: t(locale, key, params) };
	}
	return undefined;
}

export function parsePinnedParam(raw: string | null, locale: Locale): boolean | undefined {
	if (raw === null) return undefined;
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	error(400, { code: 'invalidPinned', message: t(locale, 'error.invalidPinned') });
}

// GET /api/notes tag filter: repeated ?tag= plus ?match=any|all.
export function parseTagFilterParams(params: URLSearchParams, locale: Locale): TagFilter {
	const parsed = parseTagFilter(params.getAll('tag'), params.get('match'));
	if (parsed.ok) return parsed.value;
	if (parsed.code === 'invalidMatch') {
		error(400, { code: 'invalidMatch', message: t(locale, 'error.invalidMatch') });
	}
	error(400, {
		code: 'tooManyFilterTags',
		message: t(locale, 'error.noteTooManyFilterTags', { max: NOTE_FILTER_MAX_TAGS })
	});
}
