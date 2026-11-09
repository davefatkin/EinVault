import { describe, it, expect, beforeAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { load, actions } from './+page.server';

// Lets a test make the alert enqueue throw after the write committed.
const alerts = vi.hoisted(() => ({ fail: false }));
vi.mock('#lib/server/notify/incidents.js', async (importOriginal) => {
	const mod = await importOriginal<typeof import('#lib/server/notify/incidents.js')>();
	return {
		...mod,
		enqueueIncidentAlert: async (...args: Parameters<typeof mod.enqueueIncidentAlert>) => {
			if (alerts.fail) throw new Error('outbox down');
			return mod.enqueueIncidentAlert(...args);
		}
	};
});

// Caretaker "Log incident": the action is the one caretaker incident write
// that doesn't go through checkIncidentWrite, so it checks the shift, the
// assignment and the active companion itself.

const C = 'cin-comp';
const OTHER = 'cin-other';
const ON = 'cin-on';
const OFF = 'cin-off';

function create(userId: string, fields: Record<string, string>, companionId = C) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return actions.create({
		params: { companionId },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: { id: userId, role: 'caretaker' }, locale: 'en' }
	} as unknown as Parameters<typeof actions.create>[0]);
}

const status = (r: unknown) => (r as { status?: number } | undefined)?.status;

async function thrown(p: unknown) {
	try {
		await p;
		return null;
	} catch (e) {
		return e as { status: number; location?: string };
	}
}

function callLoad(companionId: string, assigned: string[], isOnShift: boolean) {
	return load({
		params: { companionId },
		locals: { user: { id: ON, role: 'caretaker' }, locale: 'en' },
		parent: async () => ({ companions: assigned.map((id) => ({ id, name: id })), isOnShift })
	} as unknown as Parameters<typeof load>[0]);
}

describe('caretaker new incident', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: ON, username: ON, displayName: 'On', role: 'caretaker' },
			{ id: OFF, username: OFF, displayName: 'Off', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: C, name: 'Care' },
			{ id: OTHER, name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: C, userId: ON },
			{ companionId: C, userId: OFF }
		]);
		const now = Date.now();
		await db.insert(schema.caretakerShifts).values({
			id: 'cin-shift',
			userId: ON,
			startAt: new Date(now - 60 * 60 * 1000),
			endAt: new Date(now + 60 * 60 * 1000)
		} as typeof schema.caretakerShifts.$inferInsert);
	});

	it('load: 403 for a companion the caretaker is not assigned to', async () => {
		expect((await thrown(callLoad(OTHER, [C], true)))?.status).toBe(403);
	});

	it('load: off shift goes back to the care page', async () => {
		const e = await thrown(callLoad(C, [C], false));
		expect(e?.status).toBe(302);
		expect(e?.location).toBe(`/care/${C}`);
	});

	it('load: on shift returns the companion', async () => {
		const data = (await callLoad(C, [C], true)) as { companion: { id: string } };
		expect(data.companion.id).toBe(C);
	});

	it('create: 403 off shift', async () => {
		expect(status(await create(OFF, { title: 'Off shift' }))).toBe(403);
	});

	it('create: 403 on an unassigned companion', async () => {
		expect(status(await create(ON, { title: 'Not mine' }, OTHER))).toBe(403);
		const rows = await db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, OTHER)
		});
		expect(rows).toHaveLength(0);
	});

	it('create: on shift logs an open incident starting now, ignoring a posted start', async () => {
		const before = Date.now() - 1000;
		const res = (await create(ON, {
			title: 'Limping',
			severity: 'moderate',
			occurredAt: new Date(2020, 0, 1).toISOString(),
			afterSave: 'client'
		})) as { id: string };
		expect(res.id).toBeTruthy();
		const row = await db.query.healthEvents.findFirst({
			where: eq(schema.healthEvents.id, res.id)
		});
		expect(row).toMatchObject({
			companionId: C,
			type: 'incident',
			title: 'Limping',
			severity: 'moderate',
			loggedBy: ON,
			resolvedAt: null
		});
		expect(row!.occurredAt.getTime()).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
	});

	it('create: a failed alert enqueue still returns the saved incident', async () => {
		const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
		alerts.fail = true;
		try {
			const res = (await create(ON, { title: 'Alert lost', afterSave: 'client' })) as {
				id: string;
			};
			expect(res.id).toBeTruthy();
			const rows = await db.query.healthEvents.findMany({
				where: eq(schema.healthEvents.title, 'Alert lost')
			});
			expect(rows.map((r) => r.id)).toEqual([res.id]);
			expect(logged).toHaveBeenCalled();
		} finally {
			alerts.fail = false;
			logged.mockRestore();
		}
	});

	it('create: 400 without a title', async () => {
		expect(status(await create(ON, { title: '  ' }))).toBe(400);
	});
});
