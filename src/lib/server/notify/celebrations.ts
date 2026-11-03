// Day-of celebration notifications (birthdays with an exact dob, homecoming
// anniversaries). Pure row building and rendering; the scheduler loads the
// companions and recipients and does delivery.
import { celebrationOn, type Celebration } from '#lib/celebrations.js';
import { localDateISO } from '#lib/date.js';
import { t, type Locale } from '#lib/i18n/index.js';
import { celebrationDedupeKey, type EnqueueRow, type Recipient } from './outbox';

/** Household-local hour from which the day's celebrations are enqueued. */
export const CELEBRATION_HOUR = 9;

export interface CelebrationCompanion {
	id: string;
	dob: string | null;
	dobApproximate: boolean;
	homecomingDate: string | null;
	isActive: boolean;
}

/**
 * One row per celebrating companion per admin/member per channel for the
 * household date of `now`. Nothing before CELEBRATION_HOUR; the date is
 * always `now`'s own day, so a missed day never catches up into the next.
 */
export function buildCelebrationRows(
	companions: CelebrationCompanion[],
	recipients: Recipient[],
	now: Date,
	opts: { mailOn: boolean; ntfyOn: boolean }
): EnqueueRow[] {
	if (now.getHours() < CELEBRATION_HOUR) return [];
	const date = localDateISO(now);
	const rows: EnqueueRow[] = [];
	for (const companion of companions) {
		if (!celebrationOn(companion, date)) continue;
		const payload = { kind: 'celebration' as const, companionId: companion.id, date };
		for (const user of recipients) {
			if (user.role === 'caretaker') continue;
			if (opts.mailOn && user.flag && user.email) {
				rows.push({
					dedupeKey: celebrationDedupeKey(companion.id, date, user.id, 'email'),
					userId: user.id,
					channel: 'email',
					payload
				});
			}
			if (opts.ntfyOn && user.ntfyTopic) {
				rows.push({
					dedupeKey: celebrationDedupeKey(companion.id, date, user.id, 'ntfy'),
					userId: user.id,
					channel: 'ntfy',
					payload
				});
			}
		}
	}
	return rows;
}

/** Body lines for a celebration, birthday first. Same wording as the banner. */
export function celebrationLines(locale: Locale, name: string, c: Celebration): string[] {
	const out: string[] = [];
	if (c.birthdayYears !== undefined) {
		out.push(t(locale, 'celebration.birthday', { name, count: c.birthdayYears }));
	}
	if (c.homecomingYears !== undefined) {
		out.push(
			t(
				locale,
				c.homecomingYears === 1 ? 'celebration.homecoming.one' : 'celebration.homecoming.other',
				{ name, count: c.homecomingYears }
			)
		);
	}
	return out;
}
