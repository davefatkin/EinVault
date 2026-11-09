import { localDateISO } from '#lib/date.js';

export type CareStatus = 'up-to-date' | 'due-today' | 'needs-attention';

export interface CareReminder {
	dueAt: Date;
	completedAt: Date | null;
}

/**
 * Derive a companion's care status from its outstanding reminders and open
 * incidents. An open incident or an overdue (past-due) reminder beats due-today
 * beats up-to-date. Completed reminders are ignored.
 */
export function careStatus(
	reminders: CareReminder[],
	now: Date = new Date(),
	openIncidents = 0
): CareStatus {
	if (openIncidents > 0) return 'needs-attention';
	const today = localDateISO(now);
	let dueToday = false;
	for (const r of reminders) {
		if (r.completedAt) continue;
		if (r.dueAt.getTime() < now.getTime()) return 'needs-attention'; // any overdue wins
		if (localDateISO(r.dueAt) === today) dueToday = true;
	}
	return dueToday ? 'due-today' : 'up-to-date';
}
