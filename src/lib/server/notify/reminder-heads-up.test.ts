// Pin a DST-observing zone so the spring-forward case crosses a real boundary even in UTC CI.
process.env.TZ = 'America/New_York';

import { describe, expect, it } from 'vitest';
import type { Recipient } from './outbox';
import { buildReminderHeadsUpRows, pickHeadsUp } from './reminder-heads-up';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Mid-year fixtures: no DST change between any lead time and the due time.
const due = new Date(2026, 5, 20, 9, 0);
const longAgo = new Date(2026, 0, 1);

const reminder = (over: Partial<Parameters<typeof pickHeadsUp>[0]> = {}) => ({
	dueAt: due,
	notifyLeadDays: '1',
	leadArmedAt: null,
	createdAt: longAgo,
	...over
});

describe('pickHeadsUp', () => {
	it('returns null before the lead time is reached', () => {
		expect(pickHeadsUp(reminder(), new Date(2026, 5, 19, 8, 59))).toBeNull();
	});

	it('returns the lead once reached, within the catch-up window', () => {
		expect(pickHeadsUp(reminder(), new Date(2026, 5, 19, 9, 0))).toBe(1);
		expect(pickHeadsUp(reminder({ notifyLeadDays: '7' }), new Date(2026, 5, 13, 20, 0))).toBe(7);
	});

	it('returns null when the lead time is older than the catch-up window', () => {
		const r = reminder({ notifyLeadDays: '7' });
		const lead = new Date(2026, 5, 13, 9, 0);
		expect(pickHeadsUp(r, new Date(lead.getTime() + DAY - 1000))).toBe(7);
		expect(pickHeadsUp(r, new Date(lead.getTime() + DAY))).toBeNull();
	});

	it('returns null once the reminder is due', () => {
		// A 1-day lead reached under an hour ago, but the due time has passed too.
		const soon = new Date(2026, 5, 19, 9, 30);
		const r = reminder({ dueAt: new Date(2026, 5, 20, 9, 0) });
		expect(pickHeadsUp(r, new Date(2026, 5, 20, 9, 0))).toBeNull();
		expect(pickHeadsUp(r, soon)).toBe(1);
	});

	it('returns null for a reminder without lead times', () => {
		expect(
			pickHeadsUp(reminder({ notifyLeadDays: null }), new Date(2026, 5, 19, 10, 0))
		).toBeNull();
	});

	it('skips a daily occurrence armed after its 1-day lead (completed on time)', () => {
		// Previous occurrence due 2026-06-19 09:00, done at 09:05; the next one
		// (due 06-20 09:00) is armed at 09:05, after its lead at 06-19 09:00.
		const r = reminder({ leadArmedAt: new Date(2026, 5, 19, 9, 5) });
		expect(pickHeadsUp(r, new Date(2026, 5, 19, 9, 6))).toBeNull();
		expect(pickHeadsUp(r, new Date(2026, 5, 19, 20, 0))).toBeNull();
	});

	it('falls back to createdAt when leadArmedAt is null', () => {
		const r = reminder({ createdAt: new Date(2026, 5, 19, 9, 5) });
		expect(pickHeadsUp(r, new Date(2026, 5, 19, 9, 6))).toBeNull();
	});

	it('sends the heads-up for an occurrence armed before its lead (completed early)', () => {
		const r = reminder({ leadArmedAt: new Date(2026, 5, 18, 17, 0) });
		expect(pickHeadsUp(r, new Date(2026, 5, 19, 9, 0))).toBe(1);
	});

	it('does not fire a passed 7-day lead when the due date is edited to tomorrow', () => {
		const now = new Date(2026, 5, 19, 10, 0);
		const tomorrow = new Date(2026, 5, 20, 9, 0);
		expect(
			pickHeadsUp(reminder({ dueAt: tomorrow, notifyLeadDays: '7', leadArmedAt: now }), now)
		).toBeNull();
		// Lead 7 at 06-13 09:00 is outside the window anyway; move the due so the
		// lead lands inside the window but before the edit that armed it.
		const editedDue = new Date(2026, 5, 26, 8, 0); // lead 7 at 06-19 08:00
		const r = reminder({ dueAt: editedDue, notifyLeadDays: '7', leadArmedAt: now });
		expect(pickHeadsUp(r, now)).toBeNull();
		expect(pickHeadsUp(r, new Date(now.getTime() + 60_000))).toBeNull();
		// Same edit with an occurrence armed long ago would have fired.
		expect(pickHeadsUp({ ...r, leadArmedAt: longAgo }, now)).toBe(7);
	});

	it('after two days down, sends only the 1-day lead of 7,2,1 due tomorrow', () => {
		// Due 06-20 09:00. Lead 1 at 06-19 09:00 (30 min ago), lead 2 at 06-18
		// 09:00 (24.5h ago, outside the window), lead 7 long gone.
		const now = new Date(2026, 5, 19, 9, 30);
		const r = reminder({ notifyLeadDays: '7,2,1' });
		expect(pickHeadsUp(r, now)).toBe(1);
		expect(pickHeadsUp({ ...r, notifyLeadDays: '7,2' }, now)).toBeNull();
	});

	it('sends only the shortest lead when two are inside the window', () => {
		// Spring forward on 2026-03-08: lead 2 (03-07 09:00 EST) and lead 1
		// (03-08 09:00 EDT) are 23h apart, so both sit inside 24h at 09:30.
		const springDue = new Date(2026, 2, 9, 9, 0);
		const now = new Date(2026, 2, 8, 9, 30);
		const r = reminder({ dueAt: springDue, notifyLeadDays: '2,1' });
		expect(pickHeadsUp({ ...r, notifyLeadDays: '2' }, now)).toBe(2);
		expect(pickHeadsUp(r, now)).toBe(1);
	});
});

describe('buildReminderHeadsUpRows', () => {
	const now = new Date(2026, 5, 19, 9, 30);
	const opts = { mailOn: true, ntfyOn: true };
	const rem = {
		id: 'rem-1',
		companionId: 'comp-1',
		dueAt: due,
		notifyLeadDays: '7,1',
		leadArmedAt: null,
		createdAt: longAgo
	};
	const user = (id: string, over: Partial<Recipient> = {}): Recipient => ({
		id,
		role: 'member',
		email: `${id}@example.com`,
		ntfyTopic: `${id}-topic`,
		flag: true,
		...over
	});
	const epoch = Math.floor(due.getTime() / 1000);

	it('builds email and ntfy rows with the documented dedupe keys and payload', () => {
		const rows = buildReminderHeadsUpRows([rem], [user('u1')], new Set(), now, opts);
		expect(rows.map((r) => r.dedupeKey)).toEqual([
			`reminder:rem-1:${epoch}:lead1:u1:email`,
			`reminder:rem-1:${epoch}:lead1:u1:ntfy`
		]);
		expect(rows.map((r) => r.channel)).toEqual(['email', 'ntfy']);
		expect(rows[0].payload).toEqual({
			kind: 'reminderUpcoming',
			reminderId: 'rem-1',
			dueAtEpoch: epoch,
			leadDays: 1
		});
	});

	it('skips unassigned caretakers and includes assigned ones', () => {
		const recipients = [
			user('care-a', { role: 'caretaker' }),
			user('care-b', { role: 'caretaker' })
		];
		const rows = buildReminderHeadsUpRows([rem], recipients, new Set(['comp-1:care-b']), now, opts);
		expect(new Set(rows.map((r) => r.userId))).toEqual(new Set(['care-b']));
	});

	it('needs flag, address and mailOn for email; topic and ntfyOn for ntfy', () => {
		const recipients = [
			user('noflag', { flag: false }),
			user('noaddr', { email: null }),
			user('notopic', { ntfyTopic: null })
		];
		const keys = (o: typeof opts) =>
			buildReminderHeadsUpRows([rem], recipients, new Set(), now, o).map(
				(r) => `${r.userId}:${r.channel}`
			);
		expect(keys(opts).sort()).toEqual(['noaddr:ntfy', 'noflag:ntfy', 'notopic:email']);
		expect(keys({ mailOn: false, ntfyOn: true }).sort()).toEqual(['noaddr:ntfy', 'noflag:ntfy']);
		expect(keys({ mailOn: true, ntfyOn: false })).toEqual(['notopic:email']);
	});

	it('produces nothing for reminders without lead times or with no eligible lead', () => {
		expect(
			buildReminderHeadsUpRows(
				[{ ...rem, notifyLeadDays: null }],
				[user('u1')],
				new Set(),
				now,
				opts
			)
		).toEqual([]);
		expect(
			buildReminderHeadsUpRows([rem], [user('u1')], new Set(), new Date(2026, 5, 19, 8, 0), opts)
		).toEqual([]);
	});
});
