import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t, type Locale } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import type { StorageProvider } from '$lib/server/storage';

// Per-prefix lookups for /api/photos/[...path]. Each resolver maps URL segments
// to the stored object the request may read, or throws 404/403. The serve step
// (media-serve.ts) never sees rows, so a resolver is the whole access decision.
export type ResolvedMedia = {
	provider: StorageProvider;
	key: string;
	mimeType: string;
	isPoster: boolean;
};

// eslint-disable-next-line no-undef -- App is the ambient namespace from app.d.ts
export type MediaViewer = Pick<NonNullable<App.Locals['user']>, 'id' | 'role'>;

type StoredRow = {
	provider: StorageProvider;
	storageKey: string | null;
	mimeType: string;
	posterKey: string | null;
};

function notFound(locale: Locale): never {
	error(404, t(locale, 'error.notFound'));
}

async function isAssigned(companionId: string, userId: string): Promise<boolean> {
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

	// Look up by filename, then verify the row belongs to the companion + date
	// asserted in the URL. Without this scoping, two rows sharing a filename
	// (unlikely for local/S3, possible across providers) could let one URL
	// surface another row's content.
	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.filename, filename),
		with: { entry: { columns: { companionId: true, date: true } } }
	});
	if (!photo || !photo.entry) notFound(locale);
	if (photo.entry.companionId !== urlCompanionId || photo.entry.date !== urlDate) {
		notFound(locale);
	}

	// Caretakers must be assigned to the companion that owns this photo. Reads
	// have no shift, date or active-companion rule.
	if (user.role === 'caretaker' && !(await isAssigned(photo.entry.companionId, user.id))) {
		error(403, t(locale, 'error.forbidden'));
	}

	return pickObject(photo, segments.join('/'), wantPoster, locale);
}
