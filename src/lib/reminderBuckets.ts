export interface BucketableReminder {
	id: string;
	dueAt: Date;
}

export interface ReminderBuckets<T extends BucketableReminder> {
	overdue: T[];
	today: T[];
	upcoming: T[];
}

function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * Bucket active reminders by urgency relative to `now`:
 * - overdue: dueAt < now
 * - today: same local calendar day as now AND not yet past
 * - upcoming: later than today
 * Each bucket is sorted ascending by dueAt.
 */
export function reminderBuckets<T extends BucketableReminder>(
	reminders: T[],
	now: Date
): ReminderBuckets<T> {
	const overdue: T[] = [];
	const today: T[] = [];
	const upcoming: T[] = [];
	for (const r of reminders) {
		if (r.dueAt.getTime() < now.getTime()) overdue.push(r);
		else if (isSameLocalDay(r.dueAt, now)) today.push(r);
		else upcoming.push(r);
	}
	const byDue = (a: T, b: T) => a.dueAt.getTime() - b.dueAt.getTime();
	overdue.sort(byDue);
	today.sort(byDue);
	upcoming.sort(byDue);
	return { overdue, today, upcoming };
}
