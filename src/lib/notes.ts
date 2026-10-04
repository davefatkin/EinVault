import type { MessageKey } from '$lib/i18n/en';

// Shape caps for companion notes (issue #310). Client-safe so the editor and
// the server enforce the same numbers. Storage guarantees, not operator
// tunables, so there is no env var (same reasoning as textLimits.ts).
export const NOTE_TITLE_MAX_LEN = 200;
export const NOTE_BODY_MAX_LEN = 20000;
export const NOTE_TAG_MAX_LEN = 32;
export const NOTE_MAX_TAGS = 10;

// Trim, lowercase, collapse inner whitespace. Null when empty or too long.
export function normalizeTag(raw: string): string | null {
	const tag = raw.trim().toLowerCase().replace(/\s+/g, ' ');
	if (tag.length === 0 || tag.length > NOTE_TAG_MAX_LEN) return null;
	return tag;
}

// Normalize a list and drop duplicates, keeping first-seen order.
export function normalizeTags(raw: string[]): { tags: string[]; invalid: boolean } {
	const tags: string[] = [];
	let invalid = false;
	for (const r of raw) {
		const tag = normalizeTag(r);
		if (tag === null) invalid = true;
		else if (!tags.includes(tag)) tags.push(tag);
	}
	return { tags, invalid };
}

// Typed or pasted tag text: commas separate tags.
export function splitTagInput(raw: string): string[] {
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean);
}

export type NoteErrorCode =
	'titleRequired' | 'titleTooLong' | 'invalidTitle' | 'bodyTooLong' | 'tooManyTags' | 'invalidTag';

export const NOTE_ERROR: Record<
	NoteErrorCode,
	{ key: MessageKey; params?: Record<string, number> }
> = {
	titleRequired: { key: 'error.titleRequired' },
	titleTooLong: { key: 'error.noteTitleTooLong', params: { max: NOTE_TITLE_MAX_LEN } },
	invalidTitle: { key: 'error.noteTitleNewline' },
	bodyTooLong: { key: 'error.noteBodyTooLong', params: { max: NOTE_BODY_MAX_LEN } },
	tooManyTags: { key: 'error.noteTooManyTags', params: { max: NOTE_MAX_TAGS } },
	invalidTag: { key: 'error.noteInvalidTag', params: { max: NOTE_TAG_MAX_LEN } }
};

export type NoteFieldsInput = {
	title?: string;
	body?: string;
	tags?: string[];
	pinned?: boolean;
	sharedWithCaretakers?: boolean;
};
export type NotePatch = NoteFieldsInput;
export type NewNote = {
	title: string;
	body: string;
	tags: string[];
	pinned: boolean;
	sharedWithCaretakers: boolean;
};

type Checked<T> = { ok: true; value: T } | { ok: false; code: NoteErrorCode };

function checkTitle(raw: string): Checked<string> {
	const title = raw.trim();
	if (!title) return { ok: false, code: 'titleRequired' };
	// The deprecated API alias renders titles as markdown headings.
	if (/[\r\n]/.test(title)) return { ok: false, code: 'invalidTitle' };
	if (title.length > NOTE_TITLE_MAX_LEN) return { ok: false, code: 'titleTooLong' };
	return { ok: true, value: title };
}

function checkTags(raw: string[]): Checked<string[]> {
	const { tags, invalid } = normalizeTags(raw);
	if (invalid) return { ok: false, code: 'invalidTag' };
	if (tags.length > NOTE_MAX_TAGS) return { ok: false, code: 'tooManyTags' };
	return { ok: true, value: tags };
}

export function validateNotePatch(input: NoteFieldsInput): Checked<NotePatch> {
	const value: NotePatch = {};
	if (input.title !== undefined) {
		const r = checkTitle(input.title);
		if (!r.ok) return r;
		value.title = r.value;
	}
	if (input.body !== undefined) {
		if (input.body.length > NOTE_BODY_MAX_LEN) return { ok: false, code: 'bodyTooLong' };
		value.body = input.body;
	}
	if (input.tags !== undefined) {
		const r = checkTags(input.tags);
		if (!r.ok) return r;
		value.tags = r.value;
	}
	if (input.pinned !== undefined) value.pinned = input.pinned;
	if (input.sharedWithCaretakers !== undefined)
		value.sharedWithCaretakers = input.sharedWithCaretakers;
	return { ok: true, value };
}

export function validateNewNote(input: NoteFieldsInput): Checked<NewNote> {
	const r = validateNotePatch({ ...input, title: input.title ?? '' });
	if (!r.ok) return r;
	return {
		ok: true,
		value: {
			title: r.value.title!,
			body: r.value.body ?? '',
			tags: r.value.tags ?? [],
			pinned: r.value.pinned ?? false,
			sharedWithCaretakers: r.value.sharedWithCaretakers ?? false
		}
	};
}
