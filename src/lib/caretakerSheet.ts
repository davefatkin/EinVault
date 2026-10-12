import type { Species } from '$lib/activityTypes';
import type { MediaItem } from '$lib/media';

// Printable caretaker sheet (#280). Client-safe: CaretakerSheet.svelte reads
// these types and $lib/server/caretaker-sheet.ts builds the value, mapping
// rows to exactly these fields so storage keys, author ids and timestamps
// never reach the browser.

/** A ready photo or video on a shared note. noteMediaUrl() takes it as is. */
export type SheetMedia = Pick<
	MediaItem,
	'id' | 'filename' | 'originalName' | 'mediaType' | 'caption'
>;

export type SheetNote = {
	id: string;
	title: string;
	body: string; // markdown
	pinned: boolean;
	tags: string[];
	media: SheetMedia[];
};

export type CaretakerSheet = {
	companion: {
		id: string;
		name: string;
		species: Species;
		breed: string | null;
		sex: string | null;
		dob: string | null;
		microchip: string | null;
		avatarPath: string | null; // CompanionAvatar builds the URL itself
	};
	latestWeight: { weight: number; unit: string; recordedAt: Date } | null;
	schedules: { feeding: string | null; walk: string | null; medication: string | null }; // markdown
	vet: { name: string | null; clinic: string | null; phone: string | null } | null; // null when all three are empty
	emergency: { name: string | null; phone: string | null } | null; // null when both are empty
	owners: { id: string; displayName: string; phone: string | null; email: string | null }[]; // only with a phone or email
	notes: SheetNote[];
};

/** Sections with their own Include checkbox. */
export type SheetSection = 'header' | 'contacts' | 'household' | 'routine' | 'notes';

/** Every photo on the sheet, in print order. Videos have no Include choice. */
export function sheetPhotoIds(sheet: Pick<CaretakerSheet, 'notes'>): string[] {
	return sheet.notes.flatMap((n) =>
		n.media.filter((m) => m.mediaType === 'photo').map((m) => m.id)
	);
}

export type PhotoSelection = { included: number; total: number; state: 'all' | 'some' | 'none' };

/**
 * The toolbar's "Include photos" state and count. Only the photos' own
 * choices count: excluding a note or a section leaves them as they were.
 */
export function photoSelection(
	photoIds: readonly string[],
	excluded: ReadonlySet<string>
): PhotoSelection {
	const total = photoIds.length;
	const included = photoIds.filter((id) => !excluded.has(id)).length;
	const state = total > 0 && included === total ? 'all' : included > 0 ? 'some' : 'none';
	return { included, total, state };
}
