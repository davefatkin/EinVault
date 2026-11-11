import Database from 'better-sqlite3';
import path from 'node:path';
import { SEED } from './seed';

type Medication = {
	companionId: string;
	name: string;
	dose?: string | null;
	instructions?: string | null;
	endedOn?: string | null;
	supplyId?: string | null;
	doseUnits?: number;
};

function open(dataDir: string) {
	const sqlite = new Database(path.join(dataDir, 'einvault.db'));
	sqlite.pragma('foreign_keys = ON');
	return sqlite;
}

/** Inserts a medication straight into the worker DB; pair with deleteMedications in finally. */
export function insertMedication(dataDir: string, m: Medication): string {
	const id = `e2e-med-${Math.random().toString(36).slice(2, 10)}`;
	const sqlite = open(dataDir);
	try {
		sqlite
			.prepare(
				`INSERT INTO medications (id, companion_id, name, dose, instructions, started_on, ended_on, supply_id, dose_units, logged_by)
				 VALUES (?, ?, ?, ?, ?, '2026-01-01', ?, ?, ?, ?)`
			)
			.run(
				id,
				m.companionId,
				m.name,
				m.dose ?? null,
				m.instructions ?? null,
				m.endedOn ?? null,
				m.supplyId ?? null,
				m.doseUnits ?? 1,
				SEED.member.id
			);
	} finally {
		sqlite.close();
	}
	return id;
}

/** Removes the medications insertMedication returned (doses cascade). */
export function deleteMedications(dataDir: string, ids: string[]) {
	const sqlite = open(dataDir);
	try {
		for (const id of ids) sqlite.prepare('DELETE FROM medications WHERE id = ?').run(id);
	} finally {
		sqlite.close();
	}
}

/** Ends a medication behind the app's back (a stale page then acts on it). */
export function endMedication(dataDir: string, id: string) {
	const sqlite = open(dataDir);
	try {
		sqlite.prepare("UPDATE medications SET ended_on = '2020-01-01' WHERE id = ?").run(id);
	} finally {
		sqlite.close();
	}
}

export function dosesFor(dataDir: string, medicationId: string) {
	const sqlite = open(dataDir);
	try {
		return sqlite
			.prepare('SELECT given_by AS givenBy, source FROM medication_doses WHERE medication_id = ?')
			.all(medicationId) as { givenBy: string | null; source: string }[];
	} finally {
		sqlite.close();
	}
}

/** Inserts a counted supply; pair with deleteSupplies (deleted after the medications that use it). */
export function insertCountedSupply(
	dataDir: string,
	s: { name: string; unit: string | null; quantity: number }
): string {
	const id = `e2e-supply-${Math.random().toString(36).slice(2, 10)}`;
	const sqlite = open(dataDir);
	try {
		sqlite
			.prepare(
				`INSERT INTO supplies (id, name, kind, unit, quantity, alerts_enabled, created_by)
				 VALUES (?, ?, 'counted', ?, ?, 0, ?)`
			)
			.run(id, s.name, s.unit, s.quantity, SEED.member.id);
	} finally {
		sqlite.close();
	}
	return id;
}

export function deleteSupplies(dataDir: string, ids: string[]) {
	const sqlite = open(dataDir);
	try {
		for (const id of ids) sqlite.prepare('DELETE FROM supplies WHERE id = ?').run(id);
	} finally {
		sqlite.close();
	}
}

/** Inserts an open dose reminder linked to a medication; pair with deleteReminders. */
export function insertDoseReminder(
	dataDir: string,
	r: { companionId: string; medicationId: string; title: string; dueAt: Date }
): string {
	const id = `e2e-rem-${Math.random().toString(36).slice(2, 10)}`;
	const sqlite = open(dataDir);
	try {
		sqlite
			.prepare(
				`INSERT INTO reminders (id, companion_id, title, type, due_at, medication_id, logged_by)
				 VALUES (?, ?, ?, 'medication', ?, ?, ?)`
			)
			.run(
				id,
				r.companionId,
				r.title,
				Math.floor(r.dueAt.getTime() / 1000),
				r.medicationId,
				SEED.member.id
			);
	} finally {
		sqlite.close();
	}
	return id;
}

export function deleteReminders(dataDir: string, ids: string[]) {
	const sqlite = open(dataDir);
	try {
		for (const id of ids) sqlite.prepare('DELETE FROM reminders WHERE id = ?').run(id);
	} finally {
		sqlite.close();
	}
}

export function supplyQuantity(dataDir: string, id: string): number | null {
	const sqlite = open(dataDir);
	try {
		const row = sqlite.prepare('SELECT quantity FROM supplies WHERE id = ?').get(id) as
			{ quantity: number | null } | undefined;
		return row?.quantity ?? null;
	} finally {
		sqlite.close();
	}
}
