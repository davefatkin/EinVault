import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { celebrationContext } from './scheduler';

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
