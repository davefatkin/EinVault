import { describe, it, expect, beforeEach } from 'vitest';
import { db, schema } from '$lib/server/db';
import { getCalendarItems } from './calendar';

const MEMBER = { id: 'm1', role: 'member' as const };
const NOW = new Date('2026-06-15T12:00:00Z');

async function seed() {
	await db.delete(schema.reminders);
	await db.delete(schema.healthEvents);
	await db.delete(schema.companionCaretakers);
	await db.delete(schema.companions);
	await db.delete(schema.users);
	await db
		.insert(schema.users)
		.values({ id: 'm1', username: 'm1', displayName: 'M', role: 'member' });
	await db.insert(schema.companions).values([
		{ id: 'c-active', name: 'Active', isActive: true },
		{ id: 'c-arch', name: 'Archived', isActive: false }
	]);
	await db.insert(schema.healthEvents).values([
		{
			id: 'h1',
			companionId: 'c-active',
			type: 'vet_visit',
			title: 'Vet',
			occurredAt: new Date('2026-06-10T12:00:00Z')
		},
		{
			id: 'h-old',
			companionId: 'c-active',
			type: 'vet_visit',
			title: 'Old',
			occurredAt: new Date('2025-01-01T12:00:00Z')
		},
		{
			id: 'h-arch',
			companionId: 'c-arch',
			type: 'vet_visit',
			title: 'Hidden',
			occurredAt: new Date('2026-06-10T12:00:00Z')
		}
	]);
	await db.insert(schema.reminders).values({
		id: 'rem1',
		companionId: 'c-active',
		title: 'Pill',
		type: 'medication',
		dueAt: new Date('2026-06-20T13:00:00Z'),
		isRecurring: false
	});
}

describe('getCalendarItems', () => {
	beforeEach(seed);

	it('member sees active-companion health + reminders, within window, not archived/old', async () => {
		const items = await getCalendarItems(MEMBER, {
			types: [],
			companionIds: [],
			historyDays: 90,
			now: NOW
		});
		const ids = items.map((i) => i.uid);
		expect(ids).toContain('health-h1@einvault');
		expect(ids).toContain('reminder-rem1@einvault');
		expect(ids).not.toContain('health-h-arch@einvault');
		expect(ids).not.toContain('health-h-old@einvault');
	});

	it('type filter narrows', async () => {
		const items = await getCalendarItems(MEMBER, {
			types: ['reminder'],
			companionIds: [],
			historyDays: 90,
			now: NOW
		});
		expect(items.every((i) => i.kind === 'reminder')).toBe(true);
	});

	it('historyDays 0 includes old events', async () => {
		const items = await getCalendarItems(MEMBER, {
			types: ['health'],
			companionIds: [],
			historyDays: 0,
			now: NOW
		});
		expect(items.map((i) => i.uid)).toContain('health-h-old@einvault');
	});

	it('companion filter restricts to the given id', async () => {
		const items = await getCalendarItems(MEMBER, {
			types: [],
			companionIds: ['nope'],
			historyDays: 90,
			now: NOW
		});
		expect(items).toHaveLength(0);
	});

	it('companion filter excludes shifts for a caretaker', async () => {
		await db
			.insert(schema.users)
			.values({ id: 'ct1', username: 'ct1', displayName: 'CT', role: 'caretaker' });
		await db
			.insert(schema.companionCaretakers)
			.values({ userId: 'ct1', companionId: 'c-active' });
		// shift end is far in the future so getUpcomingShifts returns it
		await db.insert(schema.caretakerShifts).values({
			id: 'shift1',
			userId: 'ct1',
			startAt: new Date(Date.now() + 60_000),
			endAt: new Date(Date.now() + 3_600_000)
		});

		const items = await getCalendarItems(
			{ id: 'ct1', role: 'caretaker' },
			{ types: [], companionIds: ['c-active'], historyDays: 90, now: NOW }
		);
		expect(items.every((i) => i.kind !== 'shift')).toBe(true);
	});
});
