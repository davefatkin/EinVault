import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { generateId } from '#lib/server/utils.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { localDateISO } from '#lib/date.js';
import { exceedsLen, isValidDate, type FormParse } from '#lib/server/validation.js';
import { completeReminder, computeNextDueAt, skipReminder } from '#lib/server/reminders.js';
import { applyDoseStock, restoreDoseStock } from '#lib/server/supplies.js';
import {
	DOSE_WINDOW_MS,
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

/** SQL for "active on `today`": no end date, or ending today or later. */
export function medicationActiveSql(today: string) {
	return sql`(${schema.medications.endedOn} is null or ${schema.medications.endedOn} >= ${today})`;
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

/** A synchronous better-sqlite3 transaction handle. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** R1: an ended medication never keeps open reminders. */
function deleteOpenLinkedReminders(tx: Tx, medicationId: string) {
	tx.delete(schema.reminders)
		.where(
			and(eq(schema.reminders.medicationId, medicationId), isNull(schema.reminders.completedAt))
		)
		.run();
}

/** Open linked occurrences due after the last day (local) can never be given. */
function deleteOpenLinkedRemindersAfter(tx: Tx, medicationId: string, endedOn: string) {
	const late = tx
		.select({ id: schema.reminders.id, dueAt: schema.reminders.dueAt })
		.from(schema.reminders)
		.where(
			and(eq(schema.reminders.medicationId, medicationId), isNull(schema.reminders.completedAt))
		)
		.all()
		.filter((r) => localDateISO(r.dueAt) > endedOn)
		.map((r) => r.id);
	if (late.length > 0) tx.delete(schema.reminders).where(inArray(schema.reminders.id, late)).run();
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
			else if (input.endedOn) deleteOpenLinkedRemindersAfter(tx, id, input.endedOn);
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/**
 * End an active medication today. Refused (no change) when it has already
 * ended or hasn't started yet.
 */
export async function endMedication(
	companionId: string,
	id: string,
	today: string = localDateISO()
): Promise<true | 'notFound' | 'ended' | 'notStarted'> {
	return db.transaction(
		(tx) => {
			const medication = tx
				.select({ startedOn: schema.medications.startedOn, endedOn: schema.medications.endedOn })
				.from(schema.medications)
				.where(and(eq(schema.medications.id, id), eq(schema.medications.companionId, companionId)))
				.get();
			if (!medication) return 'notFound';
			if (!isMedicationActive(medication.endedOn, today)) return 'ended';
			if (today < medication.startedOn) return 'notStarted';
			tx.update(schema.medications)
				.set({ endedOn: today })
				.where(eq(schema.medications.id, id))
				.run();
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
				opts.activeOnly ? medicationActiveSql(today) : undefined
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

/** One markdown line of the deprecated API alias: "- Name, dose: instructions". */
export function formatMedicationScheduleLine(m: {
	name: string;
	dose: string | null;
	instructions: string | null;
}): string {
	const one = (v: string | null) => (v ?? '').replace(/\s+/g, ' ').trim();
	const dose = one(m.dose);
	const instructions = one(m.instructions);
	return `- ${one(m.name)}${dose ? `, ${dose}` : ''}${instructions ? `: ${instructions}` : ''}`;
}

/**
 * Deprecated API alias `medicationSchedule`: active medications per companion
 * as markdown lines, from ONE query. Companions without any are absent.
 */
export async function medicationScheduleMarkdown(
	companionIds: string[],
	today: string = localDateISO()
): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	if (companionIds.length === 0) return out;
	const rows = await db
		.select({
			companionId: schema.medications.companionId,
			name: schema.medications.name,
			dose: schema.medications.dose,
			instructions: schema.medications.instructions
		})
		.from(schema.medications)
		.where(and(inArray(schema.medications.companionId, companionIds), medicationActiveSql(today)))
		.orderBy(asc(schema.medications.name), asc(schema.medications.id));
	const lines = new Map<string, string[]>();
	for (const r of rows) {
		const list = lines.get(r.companionId) ?? [];
		list.push(formatMedicationScheduleLine(r));
		lines.set(r.companionId, list);
	}
	for (const [id, list] of lines) out.set(id, list.join('\n'));
	return out;
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

/**
 * Remove a dose logged by mistake: only the dose row, and only when it belongs
 * to this medication of this companion. Its supply use is put back. A reminder
 * it completed stays completed (Restore on the reminders page reopens it).
 */
export async function deleteDose(
	companionId: string,
	medicationId: string,
	doseId: string
): Promise<boolean> {
	return db.transaction(
		(tx) => {
			const owned = tx
				.select({ id: schema.medicationDoses.id })
				.from(schema.medicationDoses)
				.innerJoin(
					schema.medications,
					eq(schema.medications.id, schema.medicationDoses.medicationId)
				)
				.where(
					and(
						eq(schema.medicationDoses.id, doseId),
						eq(schema.medications.id, medicationId),
						eq(schema.medications.companionId, companionId)
					)
				)
				.get();
			if (!owned) return false;
			restoreDoseStock(tx, [doseId]);
			tx.delete(schema.medicationDoses).where(eq(schema.medicationDoses.id, doseId)).run();
			return true;
		},
		{ behavior: 'immediate' }
	);
}

/** Safety net: ended medications never keep open reminders. */
export async function sweepEndedMedicationReminders(
	today: string = localDateISO()
): Promise<number> {
	const ended = db
		.select({ id: schema.medications.id })
		.from(schema.medications)
		.where(and(isNotNull(schema.medications.endedOn), lt(schema.medications.endedOn, today)));
	const removed = await db
		.delete(schema.reminders)
		.where(and(inArray(schema.reminders.medicationId, ended), isNull(schema.reminders.completedAt)))
		.returning({ id: schema.reminders.id });
	return removed.length;
}

/** Upper bound on missed occurrences `logDose` walks through in one call. */
const MAX_CATCH_UP = 400;

// How far ahead of the server clock a givenAt may be and still count (as now).
const FUTURE_GRACE_MS = 5 * 60 * 1000;

type Reminder = typeof schema.reminders.$inferSelect;
type LogDoseResult =
	| { doseId: string; completedReminderId: string | null }
	| 'notFound'
	| 'ended'
	| 'beforeStart'
	| 'future';

/**
 * Record that a dose was given at T (`givenAt`, default now) on local day D
 * (every "Given" button and the dose API). Refused before the start date and
 * more than 5 minutes in the future; a givenAt up to 5 minutes ahead (a device
 * clock running fast) counts as now, so it can't land on tomorrow's date.
 *
 * 1. Catch-up, oldest first, over open linked occurrences due before D: an
 *    occurrence whose series already has a newer one due by D was missed and
 *    is skipped; otherwise it is the latest one due, so this (late) dose
 *    completes it and nothing else is touched.
 * 2. Else the earliest open occurrence due by T + 3 hours (and on day D) is
 *    completed. Later ones are never touched, so a double tap at 8:10 can't
 *    take the 20:00 dose, nor a backdated dose today's.
 * 3. Else a standalone manual dose is written at T.
 *
 * Callers check that the medication belongs to the companion they act on.
 */
export async function logDose(
	medicationId: string,
	actor: { id: string },
	opts: { givenAt?: Date; note?: string; now?: Date } = {}
): Promise<LogDoseResult> {
	const now = opts.now ?? new Date();
	if (opts.givenAt && opts.givenAt.getTime() > now.getTime() + FUTURE_GRACE_MS) return 'future';
	const givenAt = opts.givenAt && opts.givenAt < now ? opts.givenAt : now;
	const day = localDateISO(givenAt);
	const medication = await db.query.medications.findFirst({
		where: eq(schema.medications.id, medicationId),
		columns: { id: true, startedOn: true, endedOn: true }
	});
	if (!medication) return 'notFound';
	if (!isMedicationActive(medication.endedOn, localDateISO(now))) return 'ended';
	if (day < medication.startedOn) return 'beforeStart';

	const complete = async (occurrence: Reminder): Promise<LogDoseResult | null> => {
		const res = completeReminder(occurrence, actor.id, { givenAt, note: opts.note });
		if (res?.doseId) return { doseId: res.doseId, completedReminderId: occurrence.id };
		// Completed but no dose: the medication was deleted or ended in between.
		if (res) {
			const current = await db.query.medications.findFirst({
				where: eq(schema.medications.id, medicationId),
				columns: { id: true }
			});
			return current ? 'ended' : 'notFound';
		}
		// Lost a race: someone else just completed it and that wrote the dose.
		const existing = await db.query.medicationDoses.findFirst({
			where: eq(schema.medicationDoses.reminderId, occurrence.id),
			columns: { id: true }
		});
		if (existing) return { doseId: existing.id, completedReminderId: occurrence.id };
		return null; // resolved some other way (skipped)
	};

	const startOfDay = new Date(givenAt);
	startOfDay.setHours(0, 0, 0, 0);
	for (let i = 0; i < MAX_CATCH_UP; i++) {
		const earlier = await db.query.reminders.findFirst({
			where: and(
				eq(schema.reminders.medicationId, medicationId),
				isNull(schema.reminders.completedAt),
				lt(schema.reminders.dueAt, startOfDay)
			),
			orderBy: [asc(schema.reminders.dueAt), asc(schema.reminders.id)]
		});
		if (!earlier) break;
		const next = computeNextDueAt(earlier);
		if (next && localDateISO(next) <= day) {
			skipReminder(earlier, actor.id);
			continue;
		}
		const done = await complete(earlier);
		if (done) return done;
	}

	const endOfDay = new Date(givenAt);
	endOfDay.setHours(23, 59, 59, 999);
	const windowEnd = new Date(Math.min(givenAt.getTime() + DOSE_WINDOW_MS, endOfDay.getTime()));
	const due = await db.query.reminders.findFirst({
		where: and(
			eq(schema.reminders.medicationId, medicationId),
			isNull(schema.reminders.completedAt),
			lte(schema.reminders.dueAt, windowEnd)
		),
		orderBy: [asc(schema.reminders.dueAt), asc(schema.reminders.id)]
	});
	if (due) {
		const done = await complete(due);
		if (done) return done;
	}

	const doseId = generateId(15);
	db.transaction(
		(tx) => {
			tx.insert(schema.medicationDoses)
				.values({
					id: doseId,
					medicationId,
					givenAt,
					givenBy: actor.id,
					source: 'manual',
					note: opts.note ?? null
				})
				.run();
			applyDoseStock(tx, { id: doseId, medicationId, givenAt, givenBy: actor.id });
		},
		{ behavior: 'immediate' }
	);
	return { doseId, completedReminderId: null };
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
let sweepTimer: ReturnType<typeof setInterval> | null = null;
let sweeping = false;

async function runSweep(): Promise<void> {
	if (sweeping) return;
	sweeping = true;
	try {
		const removed = await sweepEndedMedicationReminders();
		if (removed > 0)
			console.info(`[medications] removed ${removed} reminder(s) of ended medications`);
	} catch (err) {
		console.error('[medications] reminder sweep failed:', err);
	} finally {
		sweeping = false;
	}
}

/**
 * Boot entry point for the R1 safety net, independent of notification
 * settings: sweep once now, then every 10 minutes. The timer is unref'd so it
 * never keeps the process alive. Starting twice is a no-op. Returns a stop
 * function (for tests).
 */
export function startMedicationSweep(): () => void {
	if (!sweepTimer) {
		void runSweep();
		sweepTimer = setInterval(() => void runSweep(), SWEEP_INTERVAL_MS);
		sweepTimer.unref();
	}
	return () => {
		if (sweepTimer) clearInterval(sweepTimer);
		sweepTimer = null;
	};
}
