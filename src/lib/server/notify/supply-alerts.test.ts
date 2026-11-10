import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { logPurchase, type SupplyState } from '#lib/server/supplies.js';

vi.mock('#lib/server/mail/index.js', () => ({
	isMailEnabled: () => true,
	sendMail: vi.fn(async () => {})
}));
vi.mock('./ntfy', () => ({
	isNtfyEnabled: () => true,
	sendNtfy: vi.fn(async () => {})
}));
vi.mock('./links', () => ({ publicLink: (path: string) => `https://vault.test${path}` }));

const { sendMail } = await import('#lib/server/mail/index.js');
const { sendNtfy } = await import('./ntfy');
const { supplyDedupeKey } = await import('./outbox');
const {
	SUPPLY_ALERT_HOUR,
	deliverSupplyAlert,
	deliverSupplyAlertNtfy,
	pickSupplyAlerts,
	produceSupplyAlerts
} = await import('./supply-alerts');

const EIN = 'c-alert-ein';
const EDWARD = 'c-alert-edward';
const TODAY = '2026-11-09';
const NOON = new Date(2026, 10, 9, 12, 0, 0);
const dayAt = (d: number, h = 12) => new Date(2026, 10, d, h, 0, 0);

const user = (id: string, over: Partial<typeof schema.users.$inferInsert> = {}) =>
	({
		id,
		username: id,
		displayName: id,
		role: 'member',
		email: `${id}@example.com`,
		ntfyTopic: `${id}-topic`,
		notifyReminderEmail: true,
		...over
	}) as typeof schema.users.$inferInsert;

let n = 0;
async function supply(
	over: Partial<typeof schema.supplies.$inferInsert> = {},
	companions: string[] = [EIN]
): Promise<string> {
	const id = `s-alert-${++n}`;
	await db.insert(schema.supplies).values({
		id,
		name: 'Carprofen',
		kind: 'counted',
		unit: 'tablets',
		quantity: 5,
		runOutLeadDays: '14,7',
		expiryLeadDays: '14',
		...over
	});
	await db
		.insert(schema.supplyCompanions)
		.values(companions.map((companionId) => ({ supplyId: id, companionId })));
	return id;
}

/** One open daily dose series drawing `units` per dose from the supply. */
async function schedule(supplyId: string, units = 1) {
	const medicationId = `m-alert-${++n}`;
	await db.insert(schema.medications).values({
		id: medicationId,
		companionId: EIN,
		name: 'Carprofen',
		startedOn: '2026-01-01',
		supplyId,
		doseUnits: units
	});
	await db.insert(schema.reminders).values({
		id: `r-alert-${++n}`,
		companionId: EIN,
		title: 'Carprofen',
		type: 'medication',
		dueAt: dayAt(10, 8),
		isRecurring: true,
		recurrenceUnit: 'day',
		recurrenceInterval: 1,
		recurrenceAnchor: 'interval',
		medicationId
	});
}

const supplyRow = async (id: string) =>
	(await db.query.supplies.findFirst({ where: eq(schema.supplies.id, id) }))!;
const outbox = () => db.select().from(schema.notificationOutbox);
const statusOf = async (id: string) =>
	(
		await db.query.notificationOutbox.findFirst({
			where: eq(schema.notificationOutbox.id, id)
		})
	)?.status;
const outboxRow = async (userId: string, channel: 'email' | 'ntfy') =>
	(await outbox()).find((r) => r.userId === userId && r.channel === channel)!;

beforeEach(async () => {
	vi.clearAllMocks();
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOON);
	await db.delete(schema.notificationOutbox);
	await db.delete(schema.supplies);
	await db.delete(schema.reminders);
	await db.delete(schema.medications);
	await db.delete(schema.companions);
	await db.delete(schema.users);
	await db
		.insert(schema.users)
		.values([
			user('adm', { role: 'admin' }),
			user('mem', { notifyReminderEmail: false }),
			user('care', { role: 'caretaker' }),
			user('away', { isActive: false })
		]);
	await db.insert(schema.companions).values([
		{ id: EIN, name: 'Ein' },
		{ id: EDWARD, name: 'Edward' }
	]);
});

afterEach(() => {
	vi.useRealTimers();
});

describe('supplyDedupeKey', () => {
	it('builds the documented keys', () => {
		expect(supplyDedupeKey('runout', 's1', 'v1', 7, 'u1', 'ntfy')).toBe(
			'supply:s1:runout:v1:lead7:u1:ntfy'
		);
		expect(supplyDedupeKey('low', 's1', 'v1', null, 'u1', 'email')).toBe(
			'supply:s1:low:v1:u1:email'
		);
		expect(supplyDedupeKey('expiry', 's1', '2026-11-23', 14, 'u1', 'email')).toBe(
			'supply:s1:expiry:2026-11-23:lead14:u1:email'
		);
	});
});

describe('pickSupplyAlerts', () => {
	const state = (over: Partial<SupplyState> = {}): SupplyState => ({
		id: 's',
		name: 'Carprofen',
		kind: 'counted',
		unit: null,
		quantity: 5,
		lastsDays: null,
		stockedOn: null,
		expiresOn: null,
		alertsEnabled: true,
		lowStockAt: null,
		runOutOn: '2026-11-14',
		daysLeft: 5,
		runningLow: true,
		expiring: false,
		expired: false,
		companions: [],
		stockVersion: 'v1',
		runOutLeads: [14, 7],
		expiryLeads: [14],
		runOutAlerted: null,
		lowAlerted: null,
		expiryAlerted: null,
		...over
	});

	it('sends only the shortest eligible run-out lead', () => {
		expect(pickSupplyAlerts(state(), TODAY)).toEqual({ runOut: 7 });
		expect(pickSupplyAlerts(state({ daysLeft: 10 }), TODAY)).toEqual({ runOut: 14 });
		expect(pickSupplyAlerts(state({ daysLeft: 20 }), TODAY)).toEqual({});
		expect(pickSupplyAlerts(state({ runOutLeads: [] }), TODAY)).toEqual({});
	});

	it('skips a lead already sent for this stock version, or a shorter one', () => {
		expect(pickSupplyAlerts(state({ runOutAlerted: 'v1:7' }), TODAY)).toEqual({});
		expect(pickSupplyAlerts(state({ runOutAlerted: 'v1:7', daysLeft: 10 }), TODAY)).toEqual({});
		expect(pickSupplyAlerts(state({ runOutAlerted: 'v1:14' }), TODAY)).toEqual({ runOut: 7 });
		expect(pickSupplyAlerts(state({ runOutAlerted: 'v0:7' }), TODAY)).toEqual({ runOut: 7 });
	});

	it('low stock fires once per stock version', () => {
		const low = state({ daysLeft: null, lowStockAt: 5 });
		expect(pickSupplyAlerts(low, TODAY)).toEqual({ low: true });
		expect(pickSupplyAlerts({ ...low, lowAlerted: 'v1' }, TODAY)).toEqual({});
		expect(pickSupplyAlerts({ ...low, lowAlerted: 'v0' }, TODAY)).toEqual({ low: true });
		expect(pickSupplyAlerts({ ...low, quantity: 6 }, TODAY)).toEqual({});
	});

	it('expiry fires once per expiry date and lead, never for a counted supply at 0', () => {
		const exp = state({ daysLeft: null, expiresOn: '2026-11-14' });
		expect(pickSupplyAlerts(exp, TODAY)).toEqual({ expiry: 14 });
		expect(pickSupplyAlerts({ ...exp, expiryAlerted: '2026-11-14:14' }, TODAY)).toEqual({});
		expect(pickSupplyAlerts({ ...exp, expiryAlerted: '2026-10-01:14' }, TODAY)).toEqual({
			expiry: 14
		});
		expect(pickSupplyAlerts({ ...exp, quantity: 0 }, TODAY)).toEqual({});
		expect(pickSupplyAlerts({ ...exp, expiresOn: '2026-12-31' }, TODAY)).toEqual({});
	});

	it('says nothing with warnings off', () => {
		expect(pickSupplyAlerts(state({ alertsEnabled: false, lowStockAt: 9 }), TODAY)).toEqual({});
	});
});

describe('produceSupplyAlerts', () => {
	it(`waits until ${SUPPLY_ALERT_HOUR}:00 household time`, async () => {
		const s = await supply();
		await schedule(s);
		expect(await produceSupplyAlerts(dayAt(9, SUPPLY_ALERT_HOUR - 1))).toEqual([]);
		expect(await outbox()).toEqual([]);
		expect((await supplyRow(s)).runOutAlerted).toBeNull();
	});

	it('5 days left with leads 14 and 7 sends lead 7 to admins and members only, and marks it', async () => {
		const s = await supply();
		await schedule(s);
		const { stockVersion } = await supplyRow(s);
		const rows = await produceSupplyAlerts(NOON);
		expect(rows.map((r) => r.dedupeKey).sort()).toEqual([
			`supply:${s}:runout:${stockVersion}:lead7:adm:email`,
			`supply:${s}:runout:${stockVersion}:lead7:adm:ntfy`,
			`supply:${s}:runout:${stockVersion}:lead7:mem:ntfy`
		]);
		expect(rows[0].payload).toEqual({
			kind: 'supplyRunOut',
			supplyId: s,
			stockVersion,
			leadDays: 7
		});
		// Enqueued by the producer itself, before the marker.
		expect((await outbox()).length).toBe(3);
		expect((await supplyRow(s)).runOutAlerted).toBe(`${stockVersion}:7`);
	});

	it('never repeats for the same stock version, even after outbox cleanup', async () => {
		const s = await supply();
		await schedule(s);
		expect((await produceSupplyAlerts(NOON)).length).toBe(3);
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
		await db.delete(schema.notificationOutbox);
		expect(await produceSupplyAlerts(dayAt(10))).toEqual([]);
		expect(await outbox()).toEqual([]);
	});

	it('low stock warned on day 1 stays quiet a week later after cleanup (Review Focus 1)', async () => {
		const s = await supply({ quantity: 3, lowStockAt: 3, runOutLeadDays: null });
		expect((await produceSupplyAlerts(NOON)).map((r) => r.payload.kind)).toEqual([
			'supplyLowStock',
			'supplyLowStock',
			'supplyLowStock'
		]);
		await db.delete(schema.notificationOutbox);
		expect(await produceSupplyAlerts(dayAt(16))).toEqual([]);
		expect((await supplyRow(s)).lowAlerted).toBe((await supplyRow(s)).stockVersion);
	});

	it('a purchase re-arms the run-out warning', async () => {
		const s = await supply();
		await schedule(s);
		await produceSupplyAlerts(NOON);
		db.transaction((tx) =>
			logPurchase(
				tx,
				s,
				{
					date: TODAY,
					quantity: 30,
					costMinor: null,
					currency: 'USD',
					expiresOn: null,
					documentId: null,
					companionId: null,
					note: null
				},
				'adm',
				NOON
			)
		);
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
		// Used back down to 5 days left on the new stock version.
		await db.update(schema.supplies).set({ quantity: 5 }).where(eq(schema.supplies.id, s));
		const { stockVersion } = await supplyRow(s);
		const rows = await produceSupplyAlerts(NOON);
		expect(rows.length).toBe(3);
		expect(rows.every((r) => r.dedupeKey.includes(`:runout:${stockVersion}:lead7:`))).toBe(true);
	});

	it('low stock fires at the threshold, not above it', async () => {
		await supply({ quantity: 4, lowStockAt: 3 });
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
		await db.update(schema.supplies).set({ quantity: 3 });
		expect((await produceSupplyAlerts(NOON)).length).toBe(3);
	});

	it('expiry 5 days out with a 14-day lead fires; a counted supply at 0 does not', async () => {
		const s = await supply({ expiresOn: '2026-11-14' });
		const rows = await produceSupplyAlerts(NOON);
		expect(rows.map((r) => r.payload)).toContainEqual({
			kind: 'supplyExpiry',
			supplyId: s,
			expiresOn: '2026-11-14',
			leadDays: 14
		});
		expect(rows.every((r) => r.payload.kind === 'supplyExpiry')).toBe(true);
		expect((await supplyRow(s)).expiryAlerted).toBe('2026-11-14:14');

		await supply({ quantity: 0, expiresOn: '2026-11-14' });
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
	});

	it('nothing with warnings off', async () => {
		const s = await supply({ alertsEnabled: false, lowStockAt: 5, expiresOn: '2026-11-14' });
		await schedule(s);
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
	});

	it('a shared supply warns with one pet archived, not with both (Review Focus 4)', async () => {
		const s = await supply({ lowStockAt: 5 }, [EIN, EDWARD]);
		await db
			.update(schema.companions)
			.set({ isActive: false })
			.where(eq(schema.companions.id, EIN));
		expect((await produceSupplyAlerts(NOON)).length).toBe(3);
		await db.delete(schema.notificationOutbox);
		await db.update(schema.supplies).set({ lowAlerted: null }).where(eq(schema.supplies.id, s));
		await db.update(schema.companions).set({ isActive: false });
		expect(await produceSupplyAlerts(NOON)).toEqual([]);
	});

	it('never writes a row for a caretaker, even with an ntfy topic', async () => {
		await supply({ lowStockAt: 5, expiresOn: '2026-11-14' });
		const rows = await produceSupplyAlerts(NOON);
		expect(rows.length).toBeGreaterThan(0);
		expect(rows.some((r) => r.userId === 'care' || r.userId === 'away')).toBe(false);
	});
});

describe('deliverSupplyAlert / deliverSupplyAlertNtfy', () => {
	it('sends the run-out warning with the days left and a link under the first active pet', async () => {
		const s = await supply({}, [EIN, EDWARD]);
		await schedule(s);
		await produceSupplyAlerts(NOON);
		const push = await outboxRow('adm', 'ntfy');
		await deliverSupplyAlertNtfy(push, push.payload as never);
		const [topic, msg] = vi.mocked(sendNtfy).mock.calls[0];
		expect(topic).toBe('adm-topic');
		expect(msg.title).toBe('Running low: Carprofen, about 5 days left');
		// Edward sorts before Ein.
		expect(msg.click).toBe(`https://vault.test/${EDWARD}/supplies/${s}`);
		expect(await statusOf(push.id)).toBe('sent');

		const mail = await outboxRow('adm', 'email');
		await deliverSupplyAlert(mail, mail.payload as never);
		const message = vi.mocked(sendMail).mock.calls[0][0];
		expect(message.to).toBe('adm@example.com');
		expect(message.subject).toBe('Running low: Carprofen, about 5 days left');
		expect(message.text).toContain(`https://vault.test/${EDWARD}/supplies/${s}`);
		expect(await statusOf(mail.id)).toBe('sent');
	});

	it('says out of stock at 0 days left', async () => {
		const s = await supply({ quantity: 0 });
		await schedule(s);
		await produceSupplyAlerts(NOON);
		const push = await outboxRow('adm', 'ntfy');
		await deliverSupplyAlertNtfy(push, push.payload as never);
		expect(vi.mocked(sendNtfy).mock.calls[0][1].title).toBe('Out of stock: Carprofen');
		expect(await statusOf(push.id)).toBe('sent');
	});

	it('sends low stock and expiry copy', async () => {
		await supply({ quantity: 2, lowStockAt: 3, runOutLeadDays: null });
		await supply({ name: 'Eye drops', quantity: 3, expiresOn: '2026-11-23' });
		await produceSupplyAlerts(NOON);
		for (const row of (await outbox()).filter((r) => r.channel === 'ntfy' && r.userId === 'adm')) {
			await deliverSupplyAlertNtfy(row, row.payload as never);
		}
		const titles = vi.mocked(sendNtfy).mock.calls.map(([, msg]) => msg.title);
		expect(titles.sort()).toEqual([
			'Expiring soon: Eye drops, expires Nov 23',
			'Running low: Carprofen'
		]);
	});

	it('says expired once the date has passed', async () => {
		await supply({ name: 'Eye drops', quantity: 3, expiresOn: '2026-11-05' });
		await produceSupplyAlerts(NOON);
		const push = await outboxRow('adm', 'ntfy');
		await deliverSupplyAlertNtfy(push, push.payload as never);
		const [, msg] = vi.mocked(sendNtfy).mock.calls[0];
		expect(msg.title).toBe('Expired: Eye drops');
		expect(msg.message).toBe('Eye drops for Ein expired on Nov 5, 2026.');
		const mail = await outboxRow('adm', 'email');
		await deliverSupplyAlert(mail, mail.payload as never);
		expect(vi.mocked(sendMail).mock.calls[0][0].subject).toBe('Expired: Eye drops');
	});

	it('skips a run-out warning after a purchase changed the stock version', async () => {
		const s = await supply();
		await schedule(s);
		await produceSupplyAlerts(NOON);
		db.transaction((tx) =>
			logPurchase(
				tx,
				s,
				{
					date: TODAY,
					quantity: 1,
					costMinor: null,
					currency: 'USD',
					expiresOn: null,
					documentId: null,
					companionId: null,
					note: null
				},
				'adm',
				NOON
			)
		);
		const push = await outboxRow('adm', 'ntfy');
		const mail = await outboxRow('adm', 'email');
		await deliverSupplyAlertNtfy(push, push.payload as never);
		await deliverSupplyAlert(mail, mail.payload as never);
		expect(sendNtfy).not.toHaveBeenCalled();
		expect(sendMail).not.toHaveBeenCalled();
		expect(await statusOf(push.id)).toBe('skipped');
		expect(await statusOf(mail.id)).toBe('skipped');
	});

	it('skips when warnings were turned off, the condition passed, or the recipient lost the channel', async () => {
		const s = await supply({ quantity: 2, lowStockAt: 3, runOutLeadDays: null });
		await produceSupplyAlerts(NOON);
		const push = await outboxRow('adm', 'ntfy');
		const mail = await outboxRow('adm', 'email');
		const memPush = await outboxRow('mem', 'ntfy');

		await db.update(schema.supplies).set({ alertsEnabled: false });
		await deliverSupplyAlertNtfy(push, push.payload as never);
		await db.update(schema.supplies).set({ alertsEnabled: true, lowStockAt: 1 });
		await deliverSupplyAlert(mail, mail.payload as never);
		await db.update(schema.supplies).set({ lowStockAt: 3 }).where(eq(schema.supplies.id, s));
		await db.update(schema.users).set({ role: 'caretaker' }).where(eq(schema.users.id, 'mem'));
		await deliverSupplyAlertNtfy(memPush, memPush.payload as never);

		expect(sendNtfy).not.toHaveBeenCalled();
		expect(sendMail).not.toHaveBeenCalled();
		for (const r of [push, mail, memPush]) expect(await statusOf(r.id)).toBe('skipped');
	});
});
