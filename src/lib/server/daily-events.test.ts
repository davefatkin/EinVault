import { describe, it, expect, beforeAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { logDailyEvent, checkSpeciesAndNarrow } from './daily-events';
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

	it('stores valid subtypes and drops cross-type ones', async () => {
		const ok = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], {
			type: 'bathroom' as const,
			notes: null,
			durationMinutes: null,
			loggedAt: new Date(),
			subtypes: ['pee']
		});
		expect(ok.ok).toBe(true);
		if (!ok.ok) return;
		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, ok.ids[0])
		});
		expect(row?.subtypes).toEqual(['pee']);

		// one valid + one invalid on bathroom keeps only the valid value
		const mixed = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], {
			type: 'bathroom' as const,
			notes: null,
			durationMinutes: null,
			loggedAt: new Date(),
			subtypes: ['pee', 'nope']
		});
		expect(mixed.ok).toBe(true);
		if (!mixed.ok) return;
		const mixedRow = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, mixed.ids[0])
		});
		expect(mixedRow?.subtypes).toEqual(['pee']);

		// all-invalid for the type → null, not an error
		const bad = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], {
			...input,
			subtypes: ['pee']
		});
		expect(bad.ok).toBe(true);
		if (!bad.ok) return;
		const badRow = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, bad.ids[0])
		});
		expect(badRow?.subtypes).toBeNull();
	});

	it('normalizes multi-select subtypes into registry order', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], {
			type: 'grooming' as const,
			notes: null,
			durationMinutes: null,
			loggedAt: new Date(),
			subtypes: ['nails', 'bath']
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, res.ids[0])
		});
		expect(row?.subtypes).toEqual(['bath', 'nails']);
	});

	it('omitted subtypes stay null', async () => {
		const res = await logDailyEvent({ id: 'de-mem', role: 'member' }, ['de-c1'], input);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, res.ids[0])
		});
		expect(row?.subtypes).toBeNull();
	});
});

describe('logDailyEvent species rules', () => {
	const dogId = 'de-sp-dog';
	const catId = 'de-sp-cat';
	const admin = { id: 'de-sp-admin', role: 'admin' as const };

	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: admin.id,
			username: admin.id,
			displayName: 'Admin',
			role: 'admin'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: dogId, name: 'Rex2', species: 'dog' },
			{ id: catId, name: 'Whiskers', species: 'cat' }
		] as (typeof schema.companions.$inferInsert)[]);
	});

	it('rejects a type the cat cannot have, writing nothing', async () => {
		const before = await db.select().from(schema.dailyEvents);
		const res = await logDailyEvent(admin, [dogId, catId], {
			type: 'bathroom',
			notes: null,
			durationMinutes: null,
			loggedAt: new Date()
		});
		expect(res).toEqual({ ok: false, code: 'typeNotAllowedForSpecies' });
		expect(await db.select().from(schema.dailyEvents)).toHaveLength(before.length);
	});

	it('rejects litter for a dog', async () => {
		const res = await logDailyEvent(admin, [dogId], {
			type: 'litter',
			notes: null,
			durationMinutes: null,
			loggedAt: new Date()
		});
		expect(res).toEqual({ ok: false, code: 'typeNotAllowedForSpecies' });
	});

	it('narrows subtypes per row for a mixed walk', async () => {
		const res = await logDailyEvent(admin, [dogId, catId], {
			type: 'walk',
			notes: null,
			durationMinutes: 20,
			loggedAt: new Date(),
			subtypes: ['hike']
		});
		expect(res.ok).toBe(true);
		const rows = await db.query.dailyEvents.findMany({
			where: inArray(schema.dailyEvents.id, (res as { ids: string[] }).ids)
		});
		expect(rows.find((r) => r.companionId === dogId)?.subtypes).toEqual(['hike']);
		expect(rows.find((r) => r.companionId === catId)?.subtypes).toBeNull();
	});

	it('checks authorization before the subtype rule', async () => {
		const res = await logDailyEvent(
			{ id: 'de-sp-nobody', role: 'caretaker' },
			[catId],
			{ type: 'walk', notes: null, durationMinutes: null, loggedAt: new Date(), subtypes: ['x'] },
			{ rejectUnusableSubtypes: true }
		);
		expect(res.ok).toBe(false);
		expect((res as { code: string }).code).not.toBe('invalidSubtype');
	});

	it('accepts litter for a cat with litter subtypes', async () => {
		const res = await logDailyEvent(admin, [catId], {
			type: 'litter',
			notes: null,
			durationMinutes: 5,
			loggedAt: new Date(),
			subtypes: ['scoop']
		});
		expect(res.ok).toBe(true);
		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, (res as { ids: string[] }).ids[0])
		});
		expect(row?.subtypes).toEqual(['scoop']);
		expect(row?.durationMinutes).toBeNull(); // litter has no duration
	});
});

describe('checkSpeciesAndNarrow', () => {
	const dogId = 'de-csan-dog';
	const catId = 'de-csan-cat';

	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: dogId, name: 'Rex3', species: 'dog' },
			{ id: catId, name: 'Tom', species: 'cat' }
		] as (typeof schema.companions.$inferInsert)[]);
	});

	it('rejects a type one of the ids cannot have', async () => {
		const res = await checkSpeciesAndNarrow([dogId, catId], 'bathroom', null);
		expect(res).toEqual({ ok: false, code: 'typeNotAllowedForSpecies' });
	});

	it('narrows subtypes per id for a mixed walk (cat only allows leash)', async () => {
		const res = await checkSpeciesAndNarrow([dogId, catId], 'walk', ['hike', 'leash']);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.subtypesById.get(dogId)).toEqual(['leash', 'hike']);
		expect(res.subtypesById.get(catId)).toEqual(['leash']);
	});

	it('rejectUnusableSubtypes: a subtype no id can take is invalidSubtype', async () => {
		const res = await checkSpeciesAndNarrow([dogId, catId], 'walk', ['pee'], {
			rejectUnusableSubtypes: true
		});
		expect(res).toEqual({ ok: false, code: 'invalidSubtype' });
	});

	it('rejectUnusableSubtypes: one usable target keeps the subtype valid', async () => {
		const res = await checkSpeciesAndNarrow([dogId, catId], 'walk', ['hike'], {
			rejectUnusableSubtypes: true
		});
		expect(res.ok).toBe(true);
	});

	it('rejectUnusableSubtypes: the species rule wins over the subtype check', async () => {
		const res = await checkSpeciesAndNarrow([catId], 'bathroom', ['pee'], {
			rejectUnusableSubtypes: true
		});
		expect(res).toEqual({ ok: false, code: 'typeNotAllowedForSpecies' });
	});
});
