import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { Note } from '$lib/server/db/schema';
import { generateId } from '$lib/server/utils';
import type { NewNote, NotePatch } from '$lib/notes';

// Companion notes (issue #310). Pure data access: callers (form actions, the
// Bearer API) do the role and companion checks.

export type NoteWithTags = Note & { tags: string[] };
export type NoteListItem = NoteWithTags & {
	logger: { displayName: string } | null;
	updater: { displayName: string } | null;
};

const NOTE_ORDER = [desc(schema.notes.pinned), desc(schema.notes.updatedAt), asc(schema.notes.id)];
const BY_LINE = {
	logger: { columns: { displayName: true } },
	updater: { columns: { displayName: true } }
} as const;

async function attachTags<T extends Note>(rows: T[]): Promise<(T & { tags: string[] })[]> {
	if (rows.length === 0) return [];
	const tagRows = await db
		.select()
		.from(schema.noteTags)
		.where(
			inArray(
				schema.noteTags.noteId,
				rows.map((r) => r.id)
			)
		)
		.orderBy(asc(schema.noteTags.tag));
	const byNote = new Map<string, string[]>();
	for (const { noteId, tag } of tagRows) {
		const list = byNote.get(noteId);
		if (list) list.push(tag);
		else byNote.set(noteId, [tag]);
	}
	return rows.map((r) => ({ ...r, tags: byNote.get(r.id) ?? [] }));
}

export async function listNotes(
	companionId: string,
	opts: { tag?: string; pinned?: boolean; limit?: number; offset?: number } = {}
): Promise<NoteListItem[]> {
	const filters = [eq(schema.notes.companionId, companionId)];
	if (opts.tag !== undefined) {
		filters.push(
			inArray(
				schema.notes.id,
				db
					.select({ id: schema.noteTags.noteId })
					.from(schema.noteTags)
					.where(eq(schema.noteTags.tag, opts.tag))
			)
		);
	}
	if (opts.pinned !== undefined) filters.push(eq(schema.notes.pinned, opts.pinned));
	const rows = await db.query.notes.findMany({
		where: and(...filters),
		orderBy: NOTE_ORDER,
		limit: opts.limit,
		offset: opts.offset,
		with: BY_LINE
	});
	return attachTags(rows);
}

export async function getNote(id: string, companionId?: string): Promise<NoteListItem | null> {
	const where = companionId
		? and(eq(schema.notes.id, id), eq(schema.notes.companionId, companionId))
		: eq(schema.notes.id, id);
	const row = await db.query.notes.findFirst({ where, with: BY_LINE });
	if (!row) return null;
	const [withTags] = await attachTags([row]);
	return withTags;
}

export async function createNote(
	companionId: string,
	input: NewNote,
	userId: string | null
): Promise<string> {
	const id = generateId(15);
	db.transaction((tx) => {
		tx.insert(schema.notes)
			.values({
				id,
				companionId,
				title: input.title,
				body: input.body,
				pinned: input.pinned,
				sharedWithCaretakers: input.sharedWithCaretakers,
				loggedBy: userId,
				updatedBy: userId
			})
			.run();
		if (input.tags.length > 0) {
			tx.insert(schema.noteTags)
				.values(input.tags.map((tag) => ({ noteId: id, tag })))
				.run();
		}
	});
	return id;
}

export async function updateNote(
	id: string,
	patch: NotePatch,
	userId: string | null
): Promise<boolean> {
	return db.transaction((tx) => {
		const existing = tx
			.select({ id: schema.notes.id })
			.from(schema.notes)
			.where(eq(schema.notes.id, id))
			.get();
		if (!existing) return false;
		if (Object.keys(patch).length === 0) return true;

		const set: Partial<typeof schema.notes.$inferInsert> = {
			updatedAt: new Date(),
			updatedBy: userId
		};
		if (patch.title !== undefined) set.title = patch.title;
		if (patch.body !== undefined) set.body = patch.body;
		if (patch.pinned !== undefined) set.pinned = patch.pinned;
		if (patch.sharedWithCaretakers !== undefined)
			set.sharedWithCaretakers = patch.sharedWithCaretakers;
		tx.update(schema.notes).set(set).where(eq(schema.notes.id, id)).run();

		if (patch.tags !== undefined) {
			// Diff instead of replace: every tag row change rebuilds the note's
			// search row through the note_tags triggers.
			const current = tx
				.select({ tag: schema.noteTags.tag })
				.from(schema.noteTags)
				.where(eq(schema.noteTags.noteId, id))
				.all()
				.map((r) => r.tag);
			const removed = current.filter((t) => !patch.tags!.includes(t));
			const added = patch.tags.filter((t) => !current.includes(t));
			if (removed.length > 0) {
				tx.delete(schema.noteTags)
					.where(and(eq(schema.noteTags.noteId, id), inArray(schema.noteTags.tag, removed)))
					.run();
			}
			if (added.length > 0) {
				tx.insert(schema.noteTags)
					.values(added.map((tag) => ({ noteId: id, tag })))
					.run();
			}
		}
		return true;
	});
}

// Pinning is not an edit: updatedAt/updatedBy (and the search date) stay put.
export async function setPinned(id: string, pinned: boolean): Promise<boolean> {
	const rows = await db
		.update(schema.notes)
		.set({ pinned })
		.where(eq(schema.notes.id, id))
		.returning({ id: schema.notes.id });
	return rows.length > 0;
}

export async function deleteNote(id: string): Promise<boolean> {
	const rows = await db
		.delete(schema.notes)
		.where(eq(schema.notes.id, id))
		.returning({ id: schema.notes.id });
	return rows.length > 0;
}

export async function listTags(companionId?: string): Promise<{ tag: string; count: number }[]> {
	const count = sql<number>`count(*)`.mapWith(Number);
	if (companionId) {
		return db
			.select({ tag: schema.noteTags.tag, count })
			.from(schema.noteTags)
			.innerJoin(schema.notes, eq(schema.notes.id, schema.noteTags.noteId))
			.where(eq(schema.notes.companionId, companionId))
			.groupBy(schema.noteTags.tag)
			.orderBy(asc(schema.noteTags.tag));
	}
	return db
		.select({ tag: schema.noteTags.tag, count })
		.from(schema.noteTags)
		.groupBy(schema.noteTags.tag)
		.orderBy(asc(schema.noteTags.tag));
}

export async function listSharedNotes(companionId: string): Promise<NoteWithTags[]> {
	const rows = await db.query.notes.findMany({
		where: and(
			eq(schema.notes.companionId, companionId),
			eq(schema.notes.sharedWithCaretakers, true)
		),
		orderBy: NOTE_ORDER
	});
	return attachTags(rows);
}

// Backs the deprecated Companion.notesForSitter API field: each companion's
// shared notes as one markdown string. Companions with none are absent.
export async function sharedNotesMarkdown(companionIds: string[]): Promise<Map<string, string>> {
	if (companionIds.length === 0) return new Map();
	const rows = await db.query.notes.findMany({
		where: and(
			inArray(schema.notes.companionId, companionIds),
			eq(schema.notes.sharedWithCaretakers, true)
		),
		orderBy: NOTE_ORDER,
		columns: { companionId: true, title: true, body: true }
	});
	const parts = new Map<string, string[]>();
	for (const r of rows) {
		const section = `## ${r.title}\n\n${r.body}`.trimEnd();
		const list = parts.get(r.companionId);
		if (list) list.push(section);
		else parts.set(r.companionId, [section]);
	}
	return new Map([...parts].map(([id, sections]) => [id, sections.join('\n\n')]));
}
