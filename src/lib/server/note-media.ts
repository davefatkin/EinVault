import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import type { Media } from '$lib/server/db/schema';
import { MEDIA_ITEM_COLUMNS, WITH_LOGGER } from '$lib/server/media-columns';
import { toMediaItem, type MediaItem, type MediaStatus } from '$lib/media';
import { getStorage, STORAGE_BACKEND } from '$lib/server/storage';
import { deleteMediaBlobs } from '$lib/server/storage/media-blobs';
import type { PreparedMedia } from '$lib/server/storage/media-upload';

// Note media (issue #321). Pure data access plus the upload commit; callers
// (the /api/companions/.../notes/[noteId]/media routes, note pages) run
// assertCanWriteNoteMedia or their own read checks first.

export type InsertOutcome = 'ok' | 'noteGone' | 'cap';

export function noteMediaKey(companionId: string, noteId: string, filename: string): string {
	return `notes/${companionId}/${noteId}/${filename}`;
}

const MEDIA_ORDER = [asc(schema.media.createdAt), asc(schema.media.id)];

export async function listNoteMedia(noteId: string): Promise<MediaItem[]> {
	const rows = await db.query.media.findMany({
		where: eq(schema.media.noteId, noteId),
		columns: MEDIA_ITEM_COLUMNS,
		with: WITH_LOGGER,
		orderBy: MEDIA_ORDER
	});
	return rows.map(toMediaItem);
}

export async function countMediaForNotes(noteIds: string[]): Promise<Map<string, number>> {
	const counts = new Map<string, number>();
	if (noteIds.length === 0) return counts;
	const rows = await db
		.select({ noteId: schema.media.noteId, n: count() })
		.from(schema.media)
		.where(inArray(schema.media.noteId, noteIds))
		.groupBy(schema.media.noteId);
	for (const r of rows) if (r.noteId) counts.set(r.noteId, r.n);
	return counts;
}

export async function listMediaForNotes(noteIds: string[]): Promise<Map<string, MediaItem[]>> {
	const byNote = new Map<string, MediaItem[]>();
	if (noteIds.length === 0) return byNote;
	const rows = await db.query.media.findMany({
		where: inArray(schema.media.noteId, noteIds),
		columns: { ...MEDIA_ITEM_COLUMNS, noteId: true },
		with: WITH_LOGGER,
		orderBy: MEDIA_ORDER
	});
	for (const r of rows) {
		if (!r.noteId) continue;
		const list = byNote.get(r.noteId);
		if (list) list.push(toMediaItem(r));
		else byNote.set(r.noteId, [toMediaItem(r)]);
	}
	return byNote;
}

export async function listNoteMediaStatus(noteId: string): Promise<MediaStatus[]> {
	return db
		.select({
			id: schema.media.id,
			status: schema.media.status,
			filename: schema.media.filename,
			posterKey: schema.media.posterKey
		})
		.from(schema.media)
		.where(eq(schema.media.noteId, noteId))
		.orderBy(...MEDIA_ORDER);
}

export async function getNoteMediaItem(
	noteId: string,
	mediaId: string
): Promise<Media | undefined> {
	return db.query.media.findFirst({
		where: and(eq(schema.media.id, mediaId), eq(schema.media.noteId, noteId))
	});
}

// One item as the UI sees it, scoped to the note so a mismatched id reads as missing.
export async function getNoteMediaView(
	noteId: string,
	mediaId: string
): Promise<MediaItem | undefined> {
	const row = await db.query.media.findFirst({
		where: and(eq(schema.media.id, mediaId), eq(schema.media.noteId, noteId)),
		columns: MEDIA_ITEM_COLUMNS,
		with: WITH_LOGGER
	});
	return row ? toMediaItem(row) : undefined;
}

export async function countNoteMedia(noteId: string): Promise<number> {
	const [{ value }] = await db
		.select({ value: count() })
		.from(schema.media)
		.where(eq(schema.media.noteId, noteId));
	return value;
}

// Check-and-insert under the write lock. `immediate` takes the lock at BEGIN so
// two uploads racing for the last slot serialize instead of both seeing room,
// and a note deleted between the upload's checks and this insert reads as
// 'noteGone' instead of a foreign-key 500. better-sqlite3 transactions are
// synchronous, so storage I/O stays outside.
// A note media insert: noteId required, no other parent.
export type NoteMediaInsert = Omit<
	typeof schema.media.$inferInsert,
	'noteId' | 'entryId' | 'healthEventId'
> & { noteId: string };

export function insertNoteMedia(row: NoteMediaInsert, max: number): InsertOutcome {
	return db.transaction(
		(tx): InsertOutcome => {
			const note = tx
				.select({ id: schema.notes.id })
				.from(schema.notes)
				.where(eq(schema.notes.id, row.noteId))
				.get();
			if (!note) return 'noteGone';
			const [{ value }] = tx
				.select({ value: count() })
				.from(schema.media)
				.where(eq(schema.media.noteId, row.noteId))
				.all();
			if (value >= max) return 'cap';
			tx.insert(schema.media).values(row).run();
			return 'ok';
		},
		{ behavior: 'immediate' }
	);
}

// Commit an uploaded file: store the blob, then insert the row under the cap
// and note-existence checks. Any path that ends without a row deletes the blob
// it just stored, so a lost race or a deleted note leaves nothing behind.
export async function saveNoteMediaUpload(input: {
	companionId: string;
	noteId: string;
	mediaId: string;
	prepared: PreparedMedia;
	originalName: string | null;
	loggedBy: string;
	max: number;
}): Promise<InsertOutcome | 'putFailed'> {
	const { companionId, noteId, mediaId, prepared } = input;
	const key = noteMediaKey(companionId, noteId, prepared.filename);
	try {
		await getStorage().put({ key, body: prepared.body, contentType: prepared.contentType });
	} catch (err) {
		console.error('[note-media] storage put failed:', err);
		return 'putFailed';
	}
	const orphan = [
		{ provider: STORAGE_BACKEND, storageKey: key, originalKey: null, posterKey: null }
	];
	let outcome: InsertOutcome;
	try {
		outcome = insertNoteMedia(
			{
				id: mediaId,
				noteId,
				filename: prepared.filename,
				provider: STORAGE_BACKEND,
				storageKey: key,
				originalName: input.originalName,
				mediaType: prepared.mediaType,
				mimeType: prepared.contentType,
				sizeBytes: prepared.sizeBytes,
				status: prepared.willTranscode ? 'processing' : 'ready',
				loggedBy: input.loggedBy
			},
			input.max
		);
	} catch (err) {
		await deleteMediaBlobs(orphan, 'note-media');
		throw err;
	}
	if (outcome !== 'ok') await deleteMediaBlobs(orphan, 'note-media');
	return outcome;
}

export async function setNoteMediaCaption(
	noteId: string,
	mediaId: string,
	caption: string
): Promise<void> {
	await db
		.update(schema.media)
		.set({ caption: caption.trim() || null })
		.where(and(eq(schema.media.id, mediaId), eq(schema.media.noteId, noteId)));
}

// Row first, then objects: the row is the source of truth, and an orphaned
// object is recoverable while a row pointing at a deleted object is not.
export async function deleteNoteMediaItem(item: Media): Promise<void> {
	if (!item.noteId) return;
	// Blob keys come from the row as deleted: a worker may have marked it ready
	// (new MP4 and poster) after the caller read it.
	const deleted = await db
		.delete(schema.media)
		.where(and(eq(schema.media.id, item.id), eq(schema.media.noteId, item.noteId)))
		.returning({
			provider: schema.media.provider,
			storageKey: schema.media.storageKey,
			originalKey: schema.media.originalKey,
			posterKey: schema.media.posterKey
		});
	if (deleted.length > 0) await deleteMediaBlobs(deleted, 'note-media');
}
