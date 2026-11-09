import Database from 'better-sqlite3';
import path from 'node:path';
import { SEED } from './seed';

type Medication = {
	companionId: string;
	name: string;
	dose?: string | null;
	instructions?: string | null;
	endedOn?: string | null;
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
				`INSERT INTO medications (id, companion_id, name, dose, instructions, started_on, ended_on, logged_by)
				 VALUES (?, ?, ?, ?, ?, '2026-01-01', ?, ?)`
			)
			.run(
				id,
				m.companionId,
				m.name,
				m.dose ?? null,
				m.instructions ?? null,
				m.endedOn ?? null,
				SEED.member.id
			);
	} finally {
		sqlite.close();
	}
	return id;
}

/** Removes medications (doses cascade) and any reminders titled the same. */
export function deleteMedications(dataDir: string, ...names: string[]) {
	const sqlite = open(dataDir);
	try {
		for (const name of names) {
			sqlite.prepare('DELETE FROM reminders WHERE title = ?').run(name);
			sqlite.prepare('DELETE FROM medications WHERE name = ?').run(name);
		}
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
