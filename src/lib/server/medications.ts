import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { localDateISO } from '#lib/date.js';
import { exceedsLen, isValidDate, type FormParse } from '#lib/server/validation.js';
import { completeReminder } from '#lib/server/reminders.js';
import {
	isMedicationActive,
	type DoseView,
	type MedicationScheduleItem,
	type MedicationSummary
} from '#lib/medications.js';

export interface MedicationInput {
	name: string;
	dose: string | null;
	instructions: string | null;
	startedOn: string;
	endedOn: string | null;
}

export function parseMedicationForm(
	data: FormData,
	locale: Locale,
	today: string = localDateISO()
): FormParse<MedicationInput> {
	const name = String(data.get('name') ?? '').trim();
	const dose = String(data.get('dose') ?? '').trim();
	const instructions = String(data.get('instructions') ?? '').trim();
	const startedOn = String(data.get('startedOn') ?? '').trim() || today;
	const endedOn = String(data.get('endedOn') ?? '').trim();
	if (!name) return { ok: false, message: t(locale, 'error.nameRequired') };
	if ([name, dose, instructions].some((v) => exceedsLen(v, MAX_NOTE_LEN)))
		return { ok: false, message: t(locale, 'error.fieldTooLong', { max: MAX_NOTE_LEN }) };
	if (!isValidDate(startedOn) || (endedOn && !isValidDate(endedOn)))
		return { ok: false, message: t(locale, 'error.invalidDate') };
	if (endedOn && endedOn < startedOn)
		return { ok: false, message: t(locale, 'error.medicationEndBeforeStart') };
	return {
		ok: true,
		value: {
			name,
			dose: dose || null,
			instructions: instructions || null,
			startedOn,
			endedOn: endedOn || null
		}
	};
}

export async function createMedication(
	companionId: string,
	input: MedicationInput,
	loggedBy: string | null
): Promise<string> {
	const id = generateId(15);
	await db.insert(schema.medications).values({ id, companionId, ...input, loggedBy });
	return id;
}

export async function getMedication(companionId: string, id: string) {
	return db.query.medications.findFirst({
		where: and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId))
	});
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** R1: an ended medication never keeps open reminders. */
function deleteOpenLinkedReminders(tx: Tx, medicationId: string) {
	tx.delete(schema.reminders)
		.where(
			and(eq(schema.reminders.medicationId, medicationId), isNull(schema.reminders.completedAt))
		)
		.run();
}

export async function updateMedication(
	companionId: string,
	id: string,
	input: MedicationInput,
	today: string = localDateISO()
): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const rows = tx
				.update(schema.medications)
				.set(input)
				.where(and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId)))
				.returning({ id: schema.medications.id })
				.all();
			if (rows.length === 0) return false;
			if (!isMedicationActive(input.endedOn, today)) deleteOpenLinkedReminders(tx, id);
			return true;
		},
		{ behavior: 'immediate' }
	);
}

export async function endMedication(
	companionId: string,
	id: string,
	today: string = localDateISO()
): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const rows = tx
				.update(schema.medications)
				.set({ endedOn: today })
				.where(and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId)))
				.returning({ id: schema.medications.id })
				.all();
			if (rows.length === 0) return false;
			// Ending today still allows today's dose, but nothing may fire or spawn.
			deleteOpenLinkedReminders(tx, id);
			return true;
		},
		{ behavior: 'immediate' }
	);
}

export async function restartMedication(companionId: string, id: string): Promise<boolean> {
	const rows = await db
		.update(schema.medications)
		.set({ endedOn: null })
		.where(and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId)))
		.returning({ id: schema.medications.id });
	return rows.length > 0;
}

export async function deleteMedication(companionId: string, id: string): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const owned = tx
				.select({ id: schema.medications.id })
				.from(schema.medications)
				.where(and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId)))
				.all();
			if (owned.length === 0) return false;
			deleteOpenLinkedReminders(tx, id);
			tx.delete(schema.medications).where(eq(schema.medications.id, id)).run();
			return true;
		},
		{ behavior: 'immediate' }
	);
}

export async function listMedicationSummaries(
	companionIds: string[],
	opts: { activeOnly: boolean; today?: string }
): Promise<MedicationSummary[]> {
	if (companionIds.length === 0) return [];
	const today = opts.today ?? localDateISO();
	const meds = await db
		.select()
		.from(schema.medications)
		.where(
			and(
				inArray(schema.medications.companionId, companionIds),
				opts.activeOnly
					? sql`(${schema.medications.endedOn} is null or ${schema.medications.endedOn} >= ${today})`
					: undefined
			)
		)
		.orderBy(asc(schema.medications.name), asc(schema.medications.id));
	if (meds.length === 0) return [];
	const ids = meds.map((m) => m.id);

	const open = await db
		.select({
			medicationId: schema.reminders.medicationId,
			unit: schema.reminders.recurrenceUnit,
			interval: schema.reminders.recurrenceInterval,
			anchor: schema.reminders.recurrenceAnchor,
			anchorValue: schema.reminders.recurrenceAnchorValue,
			dueAt: schema.reminders.dueAt
		})
		.from(schema.reminders)
		.where(and(inArray(schema.reminders.medicationId, ids), isNull(schema.reminders.completedAt)))
		.orderBy(asc(schema.reminders.dueAt));
	const scheduleBy = new Map<string, MedicationScheduleItem[]>();
	for (const r of open) {
		if (!r.medicationId || !r.unit || !r.anchor) continue; // one-off reminders have no schedule
		const list = scheduleBy.get(r.medicationId) ?? [];
		list.push({
			unit: r.unit,
			interval: r.interval ?? 1,
			anchor: r.anchor,
			anchorValue: r.anchorValue,
			dueAt: r.dueAt
		});
		scheduleBy.set(r.medicationId, list);
	}
	const nextBy = new Map<string, Date>();
	for (const r of open) {
		if (r.medicationId && !nextBy.has(r.medicationId)) nextBy.set(r.medicationId, r.dueAt);
	}

	// Latest dose per medication: join on the max givenAt, tie-broken by id.
	const doses = await db
		.select({
			medicationId: schema.medicationDoses.medicationId,
			givenAt: schema.medicationDoses.givenAt,
			displayName: schema.users.displayName
		})
		.from(schema.medicationDoses)
		.leftJoin(schema.users, eq(schema.users.id, schema.medicationDoses.givenBy))
		.where(
			and(
				inArray(schema.medicationDoses.medicationId, ids),
				sql`${schema.medicationDoses.id} = (select d2.id from medication_doses d2 where d2.medication_id = ${schema.medicationDoses.medicationId} order by d2.given_at desc, d2.id desc limit 1)`
			)
		);
	const lastBy = new Map(
		doses.map((d) => [
			d.medicationId,
			{ at: d.givenAt, by: d.displayName === null ? null : { displayName: d.displayName } }
		])
	);

	return meds.map((m) => ({
		id: m.id,
		companionId: m.companionId,
		name: m.name,
		dose: m.dose,
		instructions: m.instructions,
		startedOn: m.startedOn,
		endedOn: m.endedOn,
		active: isMedicationActive(m.endedOn, today),
		nextDueAt: nextBy.get(m.id) ?? null,
		lastGiven: lastBy.get(m.id) ?? null,
		schedule: scheduleBy.get(m.id) ?? []
	}));
}

export async function listDoses(medicationId: string, limit = 50, offset = 0): Promise<DoseView[]> {
	const rows = await db
		.select({
			id: schema.medicationDoses.id,
			givenAt: schema.medicationDoses.givenAt,
			source: schema.medicationDoses.source,
			note: schema.medicationDoses.note,
			displayName: schema.users.displayName
		})
		.from(schema.medicationDoses)
		.leftJoin(schema.users, eq(schema.users.id, schema.medicationDoses.givenBy))
		.where(eq(schema.medicationDoses.medicationId, medicationId))
		.orderBy(desc(schema.medicationDoses.givenAt), desc(schema.medicationDoses.id))
		.limit(limit)
		.offset(offset);
	return rows.map((r) => ({
		id: r.id,
		givenAt: r.givenAt,
		givenBy: r.displayName === null ? null : { displayName: r.displayName },
		source: r.source,
		note: r.note
	}));
}

/** Safety net: ended medications never keep open reminders. */
export async function sweepEndedMedicationReminders(
	today: string = localDateISO()
): Promise<number> {
	return db.transaction(
		(tx) => {
			const ended = tx
				.select({ id: schema.medications.id })
				.from(schema.medications)
				.where(and(isNotNull(schema.medications.endedOn), lt(schema.medications.endedOn, today)))
				.all()
				.map((m) => m.id);
			if (ended.length === 0) return 0;
			return tx
				.delete(schema.reminders)
				.where(
					and(inArray(schema.reminders.medicationId, ended), isNull(schema.reminders.completedAt))
				)
				.returning({ id: schema.reminders.id })
				.all().length;
		},
		{ behavior: 'immediate' }
	);
}

/**
 * Record that a dose was given (every "Given" button and the dose API). If an
 * occurrence of a linked reminder is due by the end of today (local), the
 * earliest one is completed, which writes the dose; otherwise a standalone
 * manual dose is written. Callers check that the medication belongs to the
 * companion they act on.
 */
export async function logDose(
	medicationId: string,
	actor: { id: string },
	opts: { givenAt?: Date; note?: string; now?: Date } = {}
): Promise<{ doseId: string; completedReminderId: string | null } | 'notFound' | 'ended'> {
	const now = opts.now ?? new Date();
	const medication = await db.query.medications.findFirst({
		where: eq(schema.medications.id, medicationId),
		columns: { id: true, endedOn: true }
	});
	if (!medication) return 'notFound';
	if (!isMedicationActive(medication.endedOn, localDateISO(now))) return 'ended';

	const endOfToday = new Date(now);
	endOfToday.setHours(23, 59, 59, 999);
	const due = await db.query.reminders.findFirst({
		where: and(
			eq(schema.reminders.medicationId, medicationId),
			isNull(schema.reminders.completedAt),
			lte(schema.reminders.dueAt, endOfToday)
		),
		orderBy: [asc(schema.reminders.dueAt), asc(schema.reminders.id)]
	});
	if (due) {
		const res = completeReminder(due, actor.id, { givenAt: opts.givenAt, note: opts.note });
		// Completed but no dose: the medication was deleted in between.
		if (res) return res.doseId ? { doseId: res.doseId, completedReminderId: due.id } : 'notFound';
		// Lost a race: someone else just completed it and that wrote the dose.
		const existing = await db.query.medicationDoses.findFirst({
			where: eq(schema.medicationDoses.reminderId, due.id),
			columns: { id: true }
		});
		if (existing) return { doseId: existing.id, completedReminderId: due.id };
		// Resolved some other way (skipped): log the dose by hand below.
	}

	const doseId = generateId(15);
	await db.insert(schema.medicationDoses).values({
		id: doseId,
		medicationId,
		givenAt: opts.givenAt ?? now,
		givenBy: actor.id,
		source: 'manual',
		note: opts.note ?? null
	});
	return { doseId, completedReminderId: null };
}
