import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { loadGettingStartedProgress, getGettingStartedView } from './getting-started';

const C1 = 'c-gs-1';
const ARCHIVED = 'c-gs-archived';
const TODAY = '2026-11-10';
const ADMIN = 'u-gs-admin';
const MEMBER = 'u-gs-member';
const CARE = 'u-gs-care';
const NOW = new Date(2026, 10, 10, 12, 0, 0);

// eslint-disable-next-line no-undef -- App is the ambient SvelteKit namespace
type User = NonNullable<App.Locals['user']>;
async function userRow(id: string) {
	return (await db.query.users.findFirst({ where: eq(schema.users.id, id) })) as unknown as User;
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Ein' },
		{ id: ARCHIVED, name: 'Old', isActive: false }
	]);
	await db.insert(schema.users).values([
		{ id: ADMIN, username: 'gsa', displayName: 'A', role: 'admin', passwordHash: 'x' },
		{ id: MEMBER, username: 'gsm', displayName: 'M', role: 'member', passwordHash: 'x' },
		{ id: CARE, username: 'gsc', displayName: 'C', role: 'caretaker', passwordHash: 'x' }
	]);
});

beforeEach(async () => {
	await db.delete(schema.supplyEvents);
	await db.delete(schema.medicationDoses);
	await db.delete(schema.reminders);
	await db.delete(schema.medications);
	await db.delete(schema.supplies);
	await db.delete(schema.journalEntries);
	await db.delete(schema.dailyEvents);
	await db.delete(schema.healthEvents);
	await db.delete(schema.weightEntries);
	await db.delete(schema.companionCaretakers);
	await db
		.update(schema.users)
		.set({ gettingStarted: 'auto', gettingStartedSeenAt: null, gettingStartedCompletedOn: null });
});

async function supply(id: string, kind: 'counted' | 'duration' = 'counted') {
	await db.insert(schema.supplies).values({ id, name: id, kind, quantity: 10 });
}
async function med(
	id: string,
	supplyId: string | null,
	name = id,
	endedOn: string | null = null,
	companionId = C1
) {
	await db
		.insert(schema.medications)
		.values({ id, companionId, name, startedOn: '2026-01-01', endedOn, supplyId });
}
async function reminder(id: string, medicationId: string | null) {
	await db.insert(schema.reminders).values({
		id,
		companionId: C1,
		title: id,
		type: 'medication',
		dueAt: NOW,
		medicationId
	});
}
async function fullChain() {
	await db
		.insert(schema.dailyEvents)
		.values({ id: 'de1', companionId: C1, type: 'walk', loggedAt: NOW });
	await db
		.insert(schema.journalEntries)
		.values({ id: 'j1', companionId: C1, date: '2026-11-10', mood: 'good' });
	await db.insert(schema.weightEntries).values({
		id: 'w1',
		companionId: C1,
		weight: 20,
		unit: 'lbs',
		recordedAt: NOW
	});
	await supply('s1');
	await med('m1', 's1');
	await reminder('r1', 'm1');
	await db
		.insert(schema.medicationDoses)
		.values({ id: 'd1', medicationId: 'm1', givenAt: NOW, source: 'manual' });
	await db
		.insert(schema.supplyEvents)
		.values({ id: 'se1', supplyId: 's1', type: 'use', at: NOW, doseId: 'd1' });
}

describe('loadGettingStartedProgress', () => {
	it('is all false on an empty database', async () => {
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.done).toEqual({ quickLog: false, journal: false, health: false, medication: false });
		expect(p.medication).toEqual({
			supply: false,
			medication: false,
			reminder: false,
			dose: false
		});
		expect(p.doneCount).toBe(0);
		expect(p.complete).toBe(false);
		expect(p.needsReminder).toBeNull();
	});

	it('counts a journal entry only with a body or a mood', async () => {
		await db
			.insert(schema.journalEntries)
			.values({ id: 'j1', companionId: C1, date: '2026-11-10', body: '', mood: null });
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).done.journal).toBe(false);
		await db.update(schema.journalEntries).set({ mood: 'good' });
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).done.journal).toBe(true);
	});

	it('counts health events and weight entries', async () => {
		await db.insert(schema.weightEntries).values({
			id: 'w1',
			companionId: C1,
			weight: 20,
			unit: 'lbs',
			recordedAt: NOW
		});
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).done.health).toBe(true);
	});

	it('ignores a reminder on a medication with no supply', async () => {
		await med('m1', null);
		await reminder('r1', 'm1');
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.medication).toEqual({
			supply: false,
			medication: false,
			reminder: false,
			dose: false
		});
	});

	it('ignores duration supplies', async () => {
		await supply('s1', 'duration');
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).medication.supply).toBe(
			false
		);
	});

	it('ticks every step for the full chain', async () => {
		await fullChain();
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.done).toEqual({ quickLog: true, journal: true, health: true, medication: true });
		expect(p.medication).toEqual({ supply: true, medication: true, reminder: true, dose: true });
		expect(p.doneCount).toBe(4);
		expect(p.complete).toBe(true);
		expect(p.needsReminder).toBeNull();
	});

	it('names the first active medication on a counted supply with no reminder', async () => {
		await supply('s1');
		await med('m2', 's1', 'Zeta');
		await med('m3', 's1', 'Alpha');
		await med('m4', 's1', 'Aardvark', '2026-01-02');
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.needsReminder).toEqual({ id: 'm3', name: 'Alpha', companionId: C1 });
	});

	it('names a medication ending in the future as active', async () => {
		await supply('s1');
		await med('m1', 's1', 'Apoquel', '2026-12-01');
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.needsReminder).toEqual({ id: 'm1', name: 'Apoquel', companionId: C1 });
	});

	it("never names an archived pet's medication", async () => {
		await supply('s1');
		await med('m1', 's1', 'Aardvark', null, ARCHIVED);
		await med('m2', 's1', 'Zeta');
		const p = await loadGettingStartedProgress({ role: 'member' }, TODAY);
		expect(p.needsReminder).toEqual({ id: 'm2', name: 'Zeta', companionId: C1 });
	});

	it('reports caretaker assignment for admins only', async () => {
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).caretaker).toBeNull();
		expect((await loadGettingStartedProgress({ role: 'admin' }, TODAY)).caretaker).toBe(false);
		await db.insert(schema.companionCaretakers).values({ companionId: C1, userId: CARE });
		expect((await loadGettingStartedProgress({ role: 'admin' }, TODAY)).caretaker).toBe(true);
		expect((await loadGettingStartedProgress({ role: 'member' }, TODAY)).caretaker).toBeNull();
	});
});

describe('getGettingStartedView', () => {
	it('returns null for a caretaker', async () => {
		expect(await getGettingStartedView(await userRow(CARE), '2026-11-10')).toBeNull();
	});

	it('returns null when complete data was never shown, and records the day', async () => {
		await fullChain();
		expect(await getGettingStartedView(await userRow(ADMIN), '2026-11-10')).toBeNull();
		expect((await userRow(ADMIN)).gettingStartedCompletedOn).toBe('2026-11-10');
	});

	it('stays hidden after data drops for a user who was already complete', async () => {
		await fullChain();
		await getGettingStartedView(await userRow(ADMIN), '2026-11-10');
		await db.delete(schema.dailyEvents);
		expect(await getGettingStartedView(await userRow(ADMIN), '2026-11-10')).toBeNull();
		expect(await getGettingStartedView(await userRow(ADMIN), '2026-11-11')).toBeNull();
	});

	it('skips the progress queries once the card can no longer show', async () => {
		const select = vi.spyOn(db, 'select');
		try {
			await db.update(schema.users).set({ gettingStarted: 'dismissed' });
			expect(await getGettingStartedView(await userRow(ADMIN), TODAY)).toBeNull();
			await db
				.update(schema.users)
				.set({ gettingStarted: 'auto', gettingStartedCompletedOn: '2026-11-01' });
			expect(await getGettingStartedView(await userRow(ADMIN), TODAY)).toBeNull();
			expect(select).not.toHaveBeenCalled();
		} finally {
			select.mockRestore();
		}
	});

	it('opens and persists seenAt when incomplete', async () => {
		const view = await getGettingStartedView(await userRow(ADMIN), '2026-11-10');
		expect(view?.mode).toBe('open');
		expect(view?.progress.doneCount).toBe(0);
		expect((await userRow(ADMIN)).gettingStartedSeenAt).toBeInstanceOf(Date);
	});

	it('persists completedOn when completion follows a first view', async () => {
		await getGettingStartedView(await userRow(ADMIN), '2026-11-10');
		await fullChain();
		const view = await getGettingStartedView(await userRow(ADMIN), '2026-11-10');
		expect(view?.mode).toBe('allSet');
		expect((await userRow(ADMIN)).gettingStartedCompletedOn).toBe('2026-11-10');
	});
});
