import { error, type RequestEvent } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t, type Locale } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import type { StorageProvider } from '#lib/server/storage/index.js';

// Per-prefix lookups for /api/photos/[...path]. Each resolver maps URL segments
// to the stored object the request may read, or throws 404/403. The serve step
// (media-serve.ts) never sees rows, so a resolver is the whole access decision.
export type ResolvedMedia = {
	provider: StorageProvider;
	key: string;
	mimeType: string;
	isPoster: boolean;
};

export type MediaViewer = Pick<NonNullable<RequestEvent['locals']['user']>, 'id' | 'role'>;

type StoredRow = {
	provider: StorageProvider;
	storageKey: string | null;
	mimeType: string;
	posterKey: string | null;
};

function notFound(locale: Locale): never {
	error(404, t(locale, 'error.notFound'));
}

// Also used by /api/avatars, which follows the same caretaker rule.
export async function isAssigned(companionId: string, userId: string): Promise<boolean> {
	const row = await db.query.companionCaretakers.findFirst({
		where: and(
			eq(schema.companionCaretakers.companionId, companionId),
			eq(schema.companionCaretakers.userId, userId)
		)
	});
	return row !== undefined;
}

// `?poster` serves the transcoded video's generated poster JPEG instead of the
// media itself. The poster key comes from the row (resolved after the URL and
// role scoping), never from the client, so it can't be used to read another
// companion's object. The kept original (originalKey) is never served.
function pickObject(
	row: StoredRow,
	requestedPath: string,
	wantPoster: boolean,
	locale: Locale
): ResolvedMedia {
	if (wantPoster) {
		if (!row.posterKey) notFound(locale);
		return { provider: row.provider, key: row.posterKey, mimeType: 'image/jpeg', isPoster: true };
	}
	// For legacy local rows the URL path IS the storage key. S3 / Immich rows
	// always carry storage_key.
	return {
		provider: row.provider,
		key: row.storageKey ?? requestedPath,
		mimeType: row.mimeType,
		isPoster: false
	};
}

// URL shape: journal/{companionId}/{date}/{filename}
export async function resolveJournalMedia(
	segments: string[],
	user: MediaViewer,
	locale: Locale,
	wantPoster: boolean
): Promise<ResolvedMedia> {
	if (segments.length !== 4) notFound(locale);
	const [, urlCompanionId, urlDate, filename] = segments;

	// Entry first via (companion_id, date), then the file within that entry, so
	// the lookup is indexed and a row can only be reached through its own
	// companion + date URL.
	const entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, urlCompanionId),
			eq(schema.journalEntries.date, urlDate)
		),
		columns: { id: true }
	});
	if (!entry) notFound(locale);
	const photo = await db.query.media.findFirst({
		where: and(eq(schema.media.entryId, entry.id), eq(schema.media.filename, filename))
	});
	if (!photo) notFound(locale);

	// Caretakers must be assigned to the companion that owns this photo. Reads
	// have no shift, date or active-companion rule.
	if (user.role === 'caretaker' && !(await isAssigned(urlCompanionId, user.id))) {
		error(403, t(locale, 'error.forbidden'));
	}

	return pickObject(photo, segments.join('/'), wantPoster, locale);
}

// URL shape: notes/{companionId}/{noteId}/{filename}
// Members and admins can read any note's media. Caretakers follow the care
// page's rule for shared notes: assigned, companion active, note shared; shift
// doesn't matter. Unassigned is 403 (matching journal); an unshared note or an
// archived companion is 404 so a caretaker can't confirm a private note exists.
export async function resolveNoteMedia(
	segments: string[],
	user: MediaViewer,
	locale: Locale,
	wantPoster: boolean
): Promise<ResolvedMedia> {
	if (segments.length !== 4) notFound(locale);
	const [, urlCompanionId, urlNoteId, filename] = segments;

	const item = await db.query.media.findFirst({
		where: and(eq(schema.media.noteId, urlNoteId), eq(schema.media.filename, filename)),
		with: {
			note: {
				columns: { companionId: true, sharedWithCaretakers: true },
				with: { companion: { columns: { isActive: true } } }
			}
		}
	});
	if (!item || !item.note || item.note.companionId !== urlCompanionId) notFound(locale);

	if (user.role === 'caretaker') {
		if (!(await isAssigned(urlCompanionId, user.id))) error(403, t(locale, 'error.forbidden'));
		if (!item.note.sharedWithCaretakers || !item.note.companion?.isActive) notFound(locale);
	}

	return pickObject(item, segments.join('/'), wantPoster, locale);
}
