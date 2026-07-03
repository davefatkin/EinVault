import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { logDailyEvent } from './daily-events';
import { authorizeCompanions } from './companion-scope';

const HOUR = 60 * 60 * 1000;

describe('daily-events', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'de-mem', username: 'de-mem', displayName: 'M', role: 'member' },
			{ id: 'de-ct-on', username: 'de-ct-on', displayName: 'C1', role: 'caretaker' },
			{ id: 'de-ct-off', username: 'de-ct-off', displayName: 'C2', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: 'de-c1', name: 'Rex' },
			{ id: 'de-c2', name: 'Luna' },
			{ id: 'de-c3', name: 'Old', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: 'de-c1', userId: 'de-ct-on' },
			{ companionId: 'de-c1', userId: 'de-ct-off' }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
		// de-ct-on has a live shift, de-ct-off does not
		const now = Date.now();
		await db.insert(schema.caretakerShifts).values({
			id: 'de-shift',
			userId: 'de-ct-on',
			startAt: new Date(now - HOUR),
			endAt: new Date(now + HOUR)
		} as typeof schema.caretakerShifts.$inferInsert);
	});

	const input = {
		type: 'walk' as const,
		notes: null,
		durationMinutes: 30,
		loggedAt: new Date()
	};

	it('members log for any active companion', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], input);
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.ids).toHaveLength(1);
			expect(res.eventGroupId).toBeNull();
		}
	});

	it('multi-companion logs share an eventGroupId', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1', 'de-c2'], input);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.ids).toHaveLength(2);
		expect(res.eventGroupId).not.toBeNull();
		const rows = await db.query.dailyEvents.findMany({
			where: eq(schema.dailyEvents.eventGroupId, res.eventGroupId!)
		});
		expect(rows).toHaveLength(2);
	});

	it('archived companions are filtered; nothing left → noTargets', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c3'], input);
		expect(res).toEqual({ ok: false, code: 'noTargets' });

		const mixed = await authorizeCompanions({ id: 'de-mem', role: 'member' }, ['de-c2', 'de-c3']);
		expect(mixed).toEqual({ ok: true, ids: ['de-c2'] });
	});

	it('empty target list → noTargets', async () => {
		expect(await authorizeCompanions({ id: 'de-mem', role: 'member' }, [])).toEqual({
			ok: false,
			code: 'noTargets'
		});
	});

	it('caretaker off shift → noActiveShift', async () => {
		const res = await logDailyEvent({ id: 'de-ct-off', role: 'caretaker' }, ['de-c1'], input);
		expect(res).toEqual({ ok: false, code: 'noActiveShift' });
	});

	it('caretaker on shift logs assigned companions, unassigned filtered', async () => {
		const res = await authorizeCompanions({ id: 'de-ct-on', role: 'caretaker' }, [
			'de-c1',
			'de-c2'
		]);
		expect(res).toEqual({ ok: true, ids: ['de-c1'] });
	});

	it('caretaker on shift with only unassigned targets → notAssigned', async () => {
		const res = await logDailyEvent({ id: 'de-ct-on', role: 'caretaker' }, ['de-c2'], input);
		expect(res).toEqual({ ok: false, code: 'notAssigned' });
	});

	it('caretaker gets notAssigned for an unknown id (no enumeration oracle)', async () => {
		// A nonexistent companion id is indistinguishable from an existing but
		// unassigned one — both return notAssigned, so a token can't probe.
		const unknown = await authorizeCompanions({ id: 'de-ct-on', role: 'caretaker' }, ['de-nope']);
		const unassigned = await authorizeCompanions({ id: 'de-ct-on', role: 'caretaker' }, ['de-c2']);
		expect(unknown).toEqual({ ok: false, code: 'notAssigned' });
		expect(unassigned).toEqual({ ok: false, code: 'notAssigned' });
	});

	it('duration is nulled for types without duration', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], {
			...input,
			type: 'meal'
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, res.ids[0])
		});
		expect(row?.durationMinutes).toBeNull();
	});
});
