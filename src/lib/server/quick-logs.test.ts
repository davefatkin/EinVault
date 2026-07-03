import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import {
	createQuickLog,
	updateQuickLog,
	deleteQuickLog,
	setQuickLogEnabled,
	moveQuickLog,
	shareQuickLog,
	listQuickLogs,
	listQuickLogButtons,
	executeQuickLog
} from './quick-logs';

const HOUR = 60 * 60 * 1000;

const OWNER = { id: 'ql-owner', role: 'member' as const };
const OTHER = { id: 'ql-other', role: 'member' as const };
const CT = { id: 'ql-ct', role: 'caretaker' as const };

describe('quick logs', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: OWNER.id, username: OWNER.id, displayName: 'Owner', role: 'member' },
			{ id: OTHER.id, username: OTHER.id, displayName: 'Other', role: 'member' },
			{ id: CT.id, username: CT.id, displayName: 'Care', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: 'ql-c1', name: 'Rex' },
			{ id: 'ql-c2', name: 'Luna' },
			{ id: 'ql-c3', name: 'Gone', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		// Caretaker assigned to c1 only, currently on shift.
		await db.insert(schema.companionCaretakers).values({ companionId: 'ql-c1', userId: CT.id });
		await db.insert(schema.caretakerShifts).values({
			id: 'ql-shift',
			userId: CT.id,
			startAt: new Date(Date.now() - HOUR),
			endAt: new Date(Date.now() + HOUR)
		} as typeof schema.caretakerShifts.$inferInsert);
	});

	const baseInput = {
		name: 'Evening walk',
		type: 'walk' as const,
		durationMinutes: 30,
		note: 'around the block',
		isEnabled: true,
		companionIds: ['ql-c1', 'ql-c2']
	};

	it('create assigns companions and appends sortOrder', async () => {
		const id1 = await createQuickLog(OWNER, baseInput);
		const id2 = await createQuickLog(OWNER, { ...baseInput, name: 'Breakfast', type: 'meal' });

		const list = await listQuickLogs(OWNER.id);
		const q1 = list.find((q) => q.id === id1)!;
		const q2 = list.find((q) => q.id === id2)!;
		expect(q1.companions.map((c) => c.companionId).sort()).toEqual(['ql-c1', 'ql-c2']);
		expect(q2.sortOrder).toBeGreaterThan(q1.sortOrder);
		// meal has no duration → normalized away
		expect(q2.durationMinutes).toBeNull();
	});

	it('archived companions are dropped from assignment', async () => {
		const id = await createQuickLog(OWNER, { ...baseInput, companionIds: ['ql-c1', 'ql-c3'] });
		const q = (await listQuickLogs(OWNER.id)).find((x) => x.id === id)!;
		expect(q.companions.map((c) => c.companionId)).toEqual(['ql-c1']);
		await deleteQuickLog(OWNER.id, id);
	});

	it('update is ownership-scoped and replaces the assignment set', async () => {
		const id = await createQuickLog(OWNER, baseInput);

		expect(await updateQuickLog(OTHER, id, { ...baseInput, name: 'Stolen' })).toBe(false);

		expect(
			await updateQuickLog(OWNER, id, { ...baseInput, name: 'Renamed', companionIds: ['ql-c2'] })
		).toBe(true);
		const q = (await listQuickLogs(OWNER.id)).find((x) => x.id === id)!;
		expect(q.name).toBe('Renamed');
		expect(q.companions.map((c) => c.companionId)).toEqual(['ql-c2']);
		await deleteQuickLog(OWNER.id, id);
	});

	it('delete and toggle are ownership-scoped', async () => {
		const id = await createQuickLog(OWNER, baseInput);
		expect(await deleteQuickLog(OTHER.id, id)).toBe(false);
		expect(await setQuickLogEnabled(OTHER.id, id, false)).toBe(false);
		expect(await setQuickLogEnabled(OWNER.id, id, false)).toBe(true);
		expect(await deleteQuickLog(OWNER.id, id)).toBe(true);
	});

	it('move swaps neighbors and no-ops at the edges', async () => {
		const ids = (await listQuickLogs(OWNER.id)).map((q) => q.id);
		expect(ids.length).toBeGreaterThanOrEqual(2);

		await moveQuickLog(OWNER.id, ids[0], 'up'); // edge no-op
		expect((await listQuickLogs(OWNER.id)).map((q) => q.id)).toEqual(ids);

		await moveQuickLog(OWNER.id, ids[0], 'down');
		const after = (await listQuickLogs(OWNER.id)).map((q) => q.id);
		expect(after[0]).toBe(ids[1]);
		expect(after[1]).toBe(ids[0]);

		await moveQuickLog(OWNER.id, ids[0], 'up'); // restore
	});

	it('share copies independently, filtered to what the recipient may target', async () => {
		const id = await createQuickLog(OWNER, { ...baseInput, name: 'Shared walk' });

		// Member recipient gets both companions; caretaker only their assigned one.
		expect(await shareQuickLog(OWNER.id, id, [OTHER.id, CT.id, OWNER.id, 'nobody'])).toBe(2);

		const otherCopy = (await listQuickLogs(OTHER.id)).find((q) => q.name === 'Shared walk')!;
		expect(otherCopy.id).not.toBe(id);
		expect(otherCopy.companions.map((c) => c.companionId).sort()).toEqual(['ql-c1', 'ql-c2']);
		// Shared copies land disabled; the recipient must opt in before use.
		expect(otherCopy.isEnabled).toBe(false);

		const ctCopy = (await listQuickLogs(CT.id)).find((q) => q.name === 'Shared walk')!;
		expect(ctCopy.companions.map((c) => c.companionId)).toEqual(['ql-c1']);
		expect(ctCopy.isEnabled).toBe(false);

		// Copies are independent: editing the original doesn't touch them.
		await updateQuickLog(OWNER, id, { ...baseInput, name: 'Shared walk v2' });
		expect((await listQuickLogs(OTHER.id)).find((q) => q.id === otherCopy.id)!.name).toBe(
			'Shared walk'
		);
		await deleteQuickLog(OWNER.id, id);
	});

	it('recipients who can target none of the companions are skipped, not counted', async () => {
		// Only ql-c2, which the caretaker (assigned to ql-c1) cannot target.
		const id = await createQuickLog(OWNER, {
			...baseInput,
			name: 'C2 only',
			companionIds: ['ql-c2']
		});

		// Member OTHER can target ql-c2 (1 copy); caretaker CT gets zero targets → skipped.
		expect(await shareQuickLog(OWNER.id, id, [OTHER.id, CT.id])).toBe(1);
		expect((await listQuickLogs(CT.id)).find((q) => q.name === 'C2 only')).toBeUndefined();

		await deleteQuickLog(OWNER.id, id);
	});

	it('sharing a quick log you do not own copies nothing', async () => {
		const foreign = await createQuickLog(OTHER, { ...baseInput, name: 'Not yours' });
		expect(await shareQuickLog(OWNER.id, foreign, [OWNER.id])).toBe(0);
		await deleteQuickLog(OTHER.id, foreign);
	});

	it('execute logs the configured event for the remembered/assigned set', async () => {
		const id = await createQuickLog(OWNER, baseInput);

		const res = await executeQuickLog({ user: OWNER, quickLogId: id });
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.ids).toHaveLength(2); // both assigned companions

		const row = await db.query.dailyEvents.findFirst({
			where: eq(schema.dailyEvents.id, res.ids[0])
		});
		expect(row?.type).toBe('walk');
		expect(row?.notes).toBe('around the block');
		expect(row?.durationMinutes).toBe(30);
		await deleteQuickLog(OWNER.id, id);
	});

	it('execute remembers the selection only when asked, and reuses it', async () => {
		const id = await createQuickLog(OWNER, baseInput);

		// Remember a narrowed selection…
		const r1 = await executeQuickLog({
			user: OWNER,
			quickLogId: id,
			companionIds: ['ql-c2'],
			rememberSelection: true
		});
		expect(r1.ok).toBe(true);

		// …an execute without explicit targets uses it.
		const r2 = await executeQuickLog({ user: OWNER, quickLogId: id });
		expect(r2.ok && r2.ids.length === 1).toBe(true);

		// rememberSelection=false does not overwrite the memory.
		const r3 = await executeQuickLog({
			user: OWNER,
			quickLogId: id,
			companionIds: ['ql-c1', 'ql-c2'],
			rememberSelection: false
		});
		expect(r3.ok).toBe(true);
		const q = (await listQuickLogs(OWNER.id)).find((x) => x.id === id)!;
		expect(q.rememberAlso).toBe(false);
		expect(JSON.parse(q.lastCompanionIds ?? '[]')).toEqual(['ql-c2']);
		await deleteQuickLog(OWNER.id, id);
	});

	it('execute rejects disabled, foreign, and unknown quick logs', async () => {
		const id = await createQuickLog(OWNER, { ...baseInput, isEnabled: false });
		expect(await executeQuickLog({ user: OWNER, quickLogId: id })).toEqual({
			ok: false,
			code: 'disabled'
		});
		expect(await executeQuickLog({ user: OTHER, quickLogId: id })).toEqual({
			ok: false,
			code: 'notFound'
		});
		expect(await executeQuickLog({ user: OWNER, quickLogId: 'nope' })).toEqual({
			ok: false,
			code: 'notFound'
		});
		await deleteQuickLog(OWNER.id, id);
	});

	it('caretaker execution enforces shift and assignment rules', async () => {
		const id = await createQuickLog(CT, { ...baseInput, companionIds: ['ql-c1'] });
		const ok = await executeQuickLog({ user: CT, quickLogId: id });
		expect(ok.ok).toBe(true);

		// Targets outside the assignment set are filtered → noTargets.
		expect(await executeQuickLog({ user: CT, quickLogId: id, companionIds: ['ql-c2'] })).toEqual({
			ok: false,
			code: 'noTargets'
		});
		await deleteQuickLog(CT.id, id);
	});

	it('buttons list is enabled-only, scoped by companion, and prefilled', async () => {
		const id1 = await createQuickLog(OWNER, baseInput);
		const id2 = await createQuickLog(OWNER, {
			...baseInput,
			name: 'Solo',
			companionIds: ['ql-c2']
		});
		const id3 = await createQuickLog(OWNER, { ...baseInput, name: 'Off', isEnabled: false });

		const all = await listQuickLogButtons(OWNER);
		expect(all.map((b) => b.id)).toContain(id1);
		expect(all.map((b) => b.id)).toContain(id2);
		expect(all.map((b) => b.id)).not.toContain(id3);

		const forC1 = await listQuickLogButtons(OWNER, 'ql-c1');
		expect(forC1.map((b) => b.id)).toContain(id1);
		expect(forC1.map((b) => b.id)).not.toContain(id2);
		expect(forC1.find((b) => b.id === id1)!.prefillCompanionIds).toContain('ql-c1');

		for (const id of [id1, id2, id3]) await deleteQuickLog(OWNER.id, id);
	});
});
