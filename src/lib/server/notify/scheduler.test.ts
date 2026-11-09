import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { sendMail } from '#lib/server/mail/index.js';
import { sendNtfy } from './ntfy';
import {
	celebrationContext,
	deliverReminderUpcoming,
	deliverReminderUpcomingNtfy,
	drain,
	produce,
	produceReminderHeadsUps,
	produceReminders
} from './scheduler';

vi.mock('#lib/server/mail/index.js', () => ({
	isMailEnabled: () => true,
	sendMail: vi.fn(async () => {})
}));
vi.mock('./links', () => ({ publicLink: (path: string) => `https://vault.test${path}` }));
vi.mock('./ntfy', () => ({
	isNtfyEnabled: () => true,
	sendNtfy: vi.fn(async () => {})
}));

const yearsBefore = (date: string, n: number) => `${Number(date.slice(0, 4)) - n}${date.slice(4)}`;
// Clock pinned to local noon on a mid-year date: no midnight rollover, no Feb 29.
const today = '2026-06-15';
const yesterday = '2026-06-14';
const homecoming = yearsBefore(today, 3);
const payload = { companionId: 'comp-c', date: today };
const email = { userId: 'u-c', channel: 'email' as const };
const ntfy = { userId: 'u-c', channel: 'ntfy' as const };

beforeEach(async () => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
	await db.delete(schema.companions);
	await db.delete(schema.users);
	await db.insert(schema.users).values({
		id: 'u-c',
		username: 'celebrant',
		displayName: 'Celebrant',
		role: 'member',
		email: 'c@example.com',
		ntfyTopic: 'c-topic',
		notifyCelebrationEmail: true
	} as typeof schema.users.$inferInsert);
	await db.insert(schema.companions).values({
		id: 'comp-c',
		name: 'Ein',
		homecomingDate: homecoming
	} as typeof schema.companions.$inferInsert);
});

afterEach(() => {
	vi.useRealTimers();
});

const setUser = (v: Partial<typeof schema.users.$inferInsert>) =>
	db.update(schema.users).set(v).where(eq(schema.users.id, 'u-c'));
const setCompanion = (v: Partial<typeof schema.companions.$inferInsert>) =>
	db.update(schema.companions).set(v).where(eq(schema.companions.id, 'comp-c'));

describe('celebrationContext', () => {
	it('returns the current celebration and address for both channels', async () => {
		const mail = await celebrationContext(email, payload);
		expect(mail?.celebration).toEqual({ homecomingYears: 3 });
		expect(mail?.address).toBe('c@example.com');
		expect((await celebrationContext(ntfy, payload))?.address).toBe('c-topic');
	});

	it('skips a recipient demoted to caretaker', async () => {
		await setUser({ role: 'caretaker' });
		expect(await celebrationContext(email, payload)).toBeNull();
		expect(await celebrationContext(ntfy, payload)).toBeNull();
	});

	it('skips an inactive recipient', async () => {
		await setUser({ isActive: false });
		expect(await celebrationContext(email, payload)).toBeNull();
	});

	it('skips an archived companion', async () => {
		await setCompanion({ isActive: false });
		expect(await celebrationContext(email, payload)).toBeNull();
	});

	it('skips a companion whose date changed since enqueue', async () => {
		await setCompanion({ homecomingDate: yearsBefore(yesterday, 3) });
		expect(await celebrationContext(email, payload)).toBeNull();
	});

	it('skips a row whose date is no longer today', async () => {
		await setCompanion({ homecomingDate: yearsBefore(yesterday, 3) });
		expect(await celebrationContext(email, { ...payload, date: yesterday })).toBeNull();
	});

	it('skips email when opted out or without an address, ntfy without a topic', async () => {
		await setUser({ notifyCelebrationEmail: false });
		expect(await celebrationContext(email, payload)).toBeNull();
		expect(await celebrationContext(ntfy, payload)).not.toBeNull();
		await setUser({ notifyCelebrationEmail: true, email: null, ntfyTopic: null });
		expect(await celebrationContext(email, payload)).toBeNull();
		expect(await celebrationContext(ntfy, payload)).toBeNull();
	});
});

describe('reminder heads-up delivery', () => {
	type Row = Parameters<typeof deliverReminderUpcoming>[0];
	// Clock is 2026-06-15 12:00 local; the reminder is due tomorrow at 09:00.
	const dueAt = new Date(2026, 5, 16, 9, 0);
	const epoch = (d: Date) => Math.floor(d.getTime() / 1000);
	const payload = {
		kind: 'reminderUpcoming' as const,
		reminderId: 'rem-h',
		dueAtEpoch: epoch(dueAt),
		leadDays: 1
	};
	const row = (channel: 'email' | 'ntfy'): Row => ({ id: 'r1', userId: 'u-c', channel }) as Row;
	const setReminder = (v: Partial<typeof schema.reminders.$inferInsert>) =>
		db.update(schema.reminders).set(v).where(eq(schema.reminders.id, 'rem-h'));
	const deliverBoth = async (p = payload) => {
		await deliverReminderUpcoming(row('email'), p);
		await deliverReminderUpcomingNtfy(row('ntfy'), p);
	};
	const expectNothingSent = () => {
		expect(sendMail).not.toHaveBeenCalled();
		expect(sendNtfy).not.toHaveBeenCalled();
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		await db.delete(schema.notificationOutbox);
		await setUser({ notifyReminderEmail: true });
		await db.insert(schema.reminders).values({
			id: 'rem-h',
			companionId: 'comp-c',
			title: 'Flea treatment',
			type: 'medication',
			dueAt,
			notifyLeadDays: '7,1',
			createdAt: new Date(2026, 0, 1)
		});
	});

	it('emails and pushes "coming up tomorrow" when due the next local day', async () => {
		await deliverBoth();
		const mail = vi.mocked(sendMail).mock.calls[0][0];
		expect(mail.to).toBe('c@example.com');
		expect(mail.subject).toBe('Coming up tomorrow: Flea treatment');
		expect(mail.text).toContain('Ein');
		const [topic, push] = vi.mocked(sendNtfy).mock.calls[0];
		expect(topic).toBe('c-topic');
		expect(push.title).toBe('Coming up tomorrow: Flea treatment');
		expect(push.message).toContain('Ein');
		expect(push.click).toBe('https://vault.test/comp-c/reminders');
	});

	it('words the title from the days left at delivery, not the lead value', async () => {
		const later = new Date(2026, 5, 18, 9, 0);
		await setReminder({ dueAt: later });
		await deliverReminderUpcomingNtfy(row('ntfy'), { ...payload, dueAtEpoch: epoch(later) });
		const tonight = new Date(2026, 5, 15, 20, 0);
		await setReminder({ dueAt: tonight });
		await deliverReminderUpcomingNtfy(row('ntfy'), { ...payload, dueAtEpoch: epoch(tonight) });
		const titles = vi.mocked(sendNtfy).mock.calls.map(([, m]) => m.title);
		expect(titles).toEqual([
			'Coming up in 3 days: Flea treatment',
			'Coming up today: Flea treatment'
		]);
	});

	it('skips a completed reminder', async () => {
		await setReminder({ completedAt: new Date(), outcome: 'completed' });
		await deliverBoth();
		expectNothingSent();
	});

	it('skips when the due time changed since enqueue', async () => {
		await setReminder({ dueAt: new Date(2026, 5, 17, 9, 0) });
		await deliverBoth();
		expectNothingSent();
	});

	it('skips when the lead was removed from the list', async () => {
		await setReminder({ notifyLeadDays: '7' });
		await deliverBoth();
		await setReminder({ notifyLeadDays: null });
		await deliverBoth();
		expectNothingSent();
	});

	it('skips a reminder that is already due', async () => {
		const past = new Date(2026, 5, 15, 11, 0);
		await setReminder({ dueAt: past });
		await deliverBoth({ ...payload, dueAtEpoch: epoch(past) });
		expectNothingSent();
	});

	it('skips an inactive recipient', async () => {
		await setUser({ isActive: false });
		await deliverBoth();
		expectNothingSent();
	});

	it('skips an unassigned caretaker and delivers to an assigned one', async () => {
		await setUser({ role: 'caretaker' });
		await deliverBoth();
		expectNothingSent();
		await db.insert(schema.companionCaretakers).values({ companionId: 'comp-c', userId: 'u-c' });
		await deliverBoth();
		expect(sendMail).toHaveBeenCalledOnce();
		expect(sendNtfy).toHaveBeenCalledOnce();
	});

	it('skips an archived companion', async () => {
		await setCompanion({ isActive: false });
		await deliverBoth();
		expectNothingSent();
	});

	it('skips email without the reminder opt-in or an address, ntfy without a topic', async () => {
		await setUser({ notifyReminderEmail: false, ntfyTopic: null });
		await deliverBoth();
		await setUser({ notifyReminderEmail: true, email: null });
		await deliverReminderUpcoming(row('email'), payload);
		expectNothingSent();
	});

	it('drain dispatches heads-ups and skips unknown kinds', async () => {
		await db.insert(schema.notificationOutbox).values([
			{ id: 'o1', dedupeKey: 'k1', userId: 'u-c', channel: 'ntfy', payload },
			{ id: 'o2', dedupeKey: 'k2', userId: 'u-c', channel: 'email', payload },
			{
				id: 'o3',
				dedupeKey: 'k3',
				userId: 'u-c',
				channel: 'ntfy',
				payload: { kind: 'somethingNew' } as never
			},
			{
				id: 'o4',
				dedupeKey: 'k4',
				userId: 'u-c',
				channel: 'email',
				payload: { kind: 'somethingNew' } as never
			}
		]);
		await drain();
		expect(sendNtfy).toHaveBeenCalledOnce();
		expect(sendMail).toHaveBeenCalledOnce();
		const status = Object.fromEntries(
			(await db.select().from(schema.notificationOutbox)).map((r) => [r.id, r.status])
		);
		expect(status).toEqual({ o1: 'sent', o2: 'sent', o3: 'skipped', o4: 'skipped' });
	});
});

describe('reminders linked to an ended medication', () => {
	// Clock is 2026-06-15 12:00 local.
	const now = () => new Date();
	const epoch = (d: Date) => Math.floor(d.getTime() / 1000);
	const dueNow = new Date(2026, 5, 15, 11, 0);
	const dueTomorrow = new Date(2026, 5, 16, 9, 0);

	async function med(id: string, endedOn: string | null) {
		await db.insert(schema.medications).values({
			id,
			companionId: 'comp-c',
			name: id,
			startedOn: '2026-01-01',
			endedOn
		});
	}
	async function rem(id: string, medicationId: string | null, dueAt: Date, leads?: string) {
		await db.insert(schema.reminders).values({
			id,
			companionId: 'comp-c',
			title: id,
			type: 'medication',
			dueAt,
			medicationId,
			notifyLeadDays: leads ?? null,
			createdAt: new Date(2026, 0, 1)
		});
	}
	const ids = (rows: { payload: unknown }[]) =>
		[...new Set(rows.map((r) => (r.payload as { reminderId?: string }).reminderId))].sort();

	beforeEach(async () => {
		vi.clearAllMocks();
		await db.delete(schema.notificationOutbox);
		await setUser({ notifyReminderEmail: true });
		await med('m-ended', '2026-06-14');
		await med('m-last-day', '2026-06-15');
		await med('m-active', null);
	});

	it('produce sweeps open reminders of ended medications and notifies the rest', async () => {
		await rem('r-ended', 'm-ended', dueNow);
		await rem('r-active', 'm-active', dueNow);
		await produce(now());
		const left = (await db.select().from(schema.reminders)).map((r) => r.id).sort();
		expect(left).toEqual(['r-active']);
		const due = (await db.select().from(schema.notificationOutbox)).filter(
			(r) => (r.payload as { kind: string }).kind === 'reminderDue'
		);
		expect(ids(due)).toEqual(['r-active']);
	});

	it('the due producer skips a reminder whose medication has ended', async () => {
		await rem('r-ended', 'm-ended', dueNow);
		await rem('r-last-day', 'm-last-day', dueNow);
		await rem('r-active', 'm-active', dueNow);
		await rem('r-plain', null, dueNow);
		expect(ids(await produceReminders(now()))).toEqual(['r-active', 'r-last-day', 'r-plain']);
	});

	it('the heads-up producer skips ended medications and occurrences past the end date', async () => {
		await rem('h-ended', 'm-ended', dueTomorrow, '1');
		await rem('h-past-end', 'm-last-day', dueTomorrow, '1');
		await rem('h-active', 'm-active', dueTomorrow, '1');
		await rem('h-plain', null, dueTomorrow, '1');
		expect(ids(await produceReminderHeadsUps(now()))).toEqual(['h-active', 'h-plain']);
	});

	it('delivery skips a due reminder whose medication ended after enqueue', async () => {
		await rem('r-ended', 'm-ended', dueNow);
		const payload = {
			kind: 'reminderDue' as const,
			reminderId: 'r-ended',
			dueAtEpoch: epoch(dueNow)
		};
		await db.insert(schema.notificationOutbox).values([
			{ id: 'o1', dedupeKey: 'k1', userId: 'u-c', channel: 'email', payload },
			{ id: 'o2', dedupeKey: 'k2', userId: 'u-c', channel: 'ntfy', payload }
		]);
		await drain();
		expect(sendMail).not.toHaveBeenCalled();
		expect(sendNtfy).not.toHaveBeenCalled();
	});

	it('delivery skips a heads-up whose medication ended after enqueue', async () => {
		await rem('h-ended', 'm-ended', dueTomorrow, '1');
		const payload = {
			kind: 'reminderUpcoming' as const,
			reminderId: 'h-ended',
			dueAtEpoch: epoch(dueTomorrow),
			leadDays: 1
		};
		type Row = Parameters<typeof deliverReminderUpcoming>[0];
		const row = (channel: 'email' | 'ntfy'): Row => ({ id: 'x', userId: 'u-c', channel }) as Row;
		await deliverReminderUpcoming(row('email'), payload);
		await deliverReminderUpcomingNtfy(row('ntfy'), payload);
		expect(sendMail).not.toHaveBeenCalled();
		expect(sendNtfy).not.toHaveBeenCalled();
	});

	it('delivery still sends for an active medication', async () => {
		await rem('r-active', 'm-active', dueNow);
		const payload = {
			kind: 'reminderDue' as const,
			reminderId: 'r-active',
			dueAtEpoch: epoch(dueNow)
		};
		await db.insert(schema.notificationOutbox).values([
			{ id: 'o1', dedupeKey: 'k1', userId: 'u-c', channel: 'email', payload },
			{ id: 'o2', dedupeKey: 'k2', userId: 'u-c', channel: 'ntfy', payload }
		]);
		await drain();
		expect(sendMail).toHaveBeenCalledOnce();
		expect(sendNtfy).toHaveBeenCalledOnce();
	});
});
