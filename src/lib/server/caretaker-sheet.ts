import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { listSharedNotes } from '$lib/server/notes';
import type { Locale } from '$lib/i18n';
import type { CaretakerSheet } from '$lib/caretakerSheet';

// Printable caretaker sheet (#280). Pure data access: callers do the role,
// assignment and active checks (same split as notes.ts).

// Trimmed text, or null when nothing is left.
function text(v: string | null | undefined): string | null {
	const s = v?.trim();
	return s ? s : null;
}

export async function loadCaretakerSheet(companionId: string): Promise<CaretakerSheet | null> {
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!companion) return null;

	const [weight, users, notes] = await Promise.all([
		db.query.weightEntries.findFirst({
			where: eq(schema.weightEntries.companionId, companionId),
			orderBy: (w, { desc }) => [desc(w.recordedAt)],
			columns: { weight: true, unit: true, recordedAt: true }
		}),
		// Every active member and admin, as on the care page: the household has
		// no per-companion owners.
		db.query.users.findMany({
			where: and(eq(schema.users.isActive, true), ne(schema.users.role, 'caretaker')),
			orderBy: (u, { asc }) => [asc(u.displayName)],
			columns: { id: true, displayName: true, phone: true, email: true }
		}),
		// Shared notes only, for owners too: the sheet never prints a private note.
		listSharedNotes(companionId)
	]);

	const vet = {
		name: text(companion.vetName),
		clinic: text(companion.vetClinic),
		phone: text(companion.vetPhone)
	};
	const emergency = {
		name: text(companion.emergencyContactName),
		phone: text(companion.emergencyContactPhone)
	};

	return {
		companion: {
			id: companion.id,
			name: companion.name,
			species: companion.species,
			breed: text(companion.breed),
			sex: companion.sex,
			dob: text(companion.dob),
			microchip: text(companion.microchip),
			avatarPath: companion.avatarPath
		},
		latestWeight: weight ?? null,
		schedules: {
			feeding: text(companion.feedingSchedule),
			walk: text(companion.walkSchedule),
			medication: text(companion.medicationSchedule)
		},
		vet: vet.name || vet.clinic || vet.phone ? vet : null,
		emergency: emergency.name || emergency.phone ? emergency : null,
		owners: users
			.map((u) => ({
				id: u.id,
				displayName: u.displayName,
				phone: text(u.phone),
				email: text(u.email)
			}))
			.filter((u) => u.phone || u.email),
		notes: notes.map((n) => ({
			id: n.id,
			title: n.title,
			body: n.body,
			pinned: n.pinned,
			tags: n.tags,
			// Unfinished uploads don't print.
			media: n.media
				.filter((m) => m.status === 'ready')
				.map((m) => ({
					id: m.id,
					filename: m.filename,
					originalName: m.originalName,
					mediaType: m.mediaType,
					caption: m.caption
				}))
		}))
	};
}

// The sheet footer's date, formatted on the server (in TZ) so it is right
// without JavaScript; LocalTime renders ISO during SSR.
export function formatPrintedOn(locale: Locale, now: Date = new Date()): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(now);
}
