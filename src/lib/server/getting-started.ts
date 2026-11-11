import { and, asc, eq, ne, or, sql, type SQL } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { db, schema } from '#lib/server/db/index.js';
import { DEMO_MODE } from '#lib/server/env.js';
import { medicationActiveSql } from '#lib/server/medication-sql.js';
import {
	resolveCardMode,
	skipsProgress,
	GETTING_STARTED_STEPS,
	type GettingStartedPref,
	type GettingStartedProgress,
	type GettingStartedView
} from '#lib/gettingStarted.js';

async function exists(table: SQLiteTable, where?: SQL): Promise<boolean> {
	const rows = await db
		.select({ one: sql`1` })
		.from(table)
		.where(where)
		.limit(1);
	return rows.length > 0;
}

/**
 * Household-wide setup progress. Owners see every companion, so nothing is scoped.
 * `today` is the server's YYYY-MM-DD, used to tell which medications are active.
 */
export async function loadGettingStartedProgress(
	user: { role: 'admin' | 'member' | 'caretaker' },
	today: string
): Promise<GettingStartedProgress> {
	const { supplies, medications, reminders, supplyEvents } = schema;

	const countedMed = eq(supplies.kind, 'counted');
	const medsOnCounted = await db
		.select({ id: medications.id })
		.from(medications)
		.innerJoin(supplies, eq(medications.supplyId, supplies.id))
		.where(countedMed)
		.limit(1);
	const reminderOnCounted = await db
		.select({ id: reminders.id })
		.from(reminders)
		.innerJoin(medications, eq(reminders.medicationId, medications.id))
		.innerJoin(supplies, eq(medications.supplyId, supplies.id))
		.where(countedMed)
		.limit(1);

	const quickLog = await exists(schema.dailyEvents);
	const journal = await exists(
		schema.journalEntries,
		or(ne(schema.journalEntries.body, ''), sql`${schema.journalEntries.mood} is not null`)
	);
	const health = (await exists(schema.healthEvents)) || (await exists(schema.weightEntries));

	const medication = {
		supply: await exists(supplies, eq(supplies.kind, 'counted')),
		medication: medsOnCounted.length > 0,
		reminder: reminderOnCounted.length > 0,
		dose: await exists(supplyEvents, sql`${supplyEvents.doseId} is not null`)
	};
	const medicationDone = Object.values(medication).every(Boolean);

	const done = { quickLog, journal, health, medication: medicationDone };
	const doneCount = GETTING_STARTED_STEPS.filter((s) => done[s]).length;

	const caretaker = user.role === 'admin' ? await exists(schema.companionCaretakers) : null;

	const needs = await db
		.select({ id: medications.id, name: medications.name, companionId: medications.companionId })
		.from(medications)
		.innerJoin(supplies, eq(medications.supplyId, supplies.id))
		.innerJoin(schema.companions, eq(medications.companionId, schema.companions.id))
		.where(
			and(
				eq(supplies.kind, 'counted'),
				medicationActiveSql(today),
				eq(schema.companions.isActive, true),
				sql`not exists (select 1 from ${reminders} where ${reminders.medicationId} = ${medications.id})`
			)
		)
		.orderBy(asc(medications.name))
		.limit(1);

	return {
		done,
		medication,
		caretaker,
		doneCount,
		complete: doneCount === GETTING_STARTED_STEPS.length,
		needsReminder: needs[0] ?? null
	};
}

export async function getGettingStartedView(
	// eslint-disable-next-line no-undef -- App is the ambient SvelteKit namespace
	user: NonNullable<App.Locals['user']>,
	today: string
): Promise<GettingStartedView | null> {
	if (DEMO_MODE || user.role === 'caretaker') return null;

	const state = {
		pref: user.gettingStarted as GettingStartedPref,
		seenAt: user.gettingStartedSeenAt,
		completedOn: user.gettingStartedCompletedOn,
		today
	};
	if (skipsProgress(state)) return null;

	const progress = await loadGettingStartedProgress(user, today);
	const { mode, patch } = resolveCardMode({ ...state, complete: progress.complete });

	if (patch.seenAt || patch.completedOn) {
		await db
			.update(schema.users)
			.set({
				...(patch.seenAt && { gettingStartedSeenAt: patch.seenAt }),
				...(patch.completedOn && { gettingStartedCompletedOn: patch.completedOn })
			})
			.where(eq(schema.users.id, user.id));
	}

	return mode === 'hidden' ? null : { mode, progress };
}
