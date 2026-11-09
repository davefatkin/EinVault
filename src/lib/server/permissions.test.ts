import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';
import {
	assertCanWriteJournalMedia,
	assertCanWriteNoteMedia,
	assertCanWriteIncident,
	checkIncidentWrite,
	type IncidentWriteAction
} from './permissions';

type Locals = Parameters<typeof assertCanWriteJournalMedia>[0];
type Role = 'admin' | 'member' | 'caretaker';

function locals(user: { id: string; role: Role } | null): Locals {
	return { user, session: null, locale: 'en' } as unknown as Locals;
}

async function statusOf(p: Promise<void>): Promise<number | 'ok'> {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return (e as { status: number }).status;
	}
}

const today = localDateISO();
const yesterday = localDateISO(new Date(Date.now() - 24 * 60 * 60 * 1000));

describe('assertCanWriteJournalMedia', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'adm', username: 'adm', displayName: 'A', role: 'admin' },
			{ id: 'mem', username: 'mem', displayName: 'M', role: 'member' },
			{ id: 'ct-on', username: 'cton', displayName: 'C1', role: 'caretaker' },
			{ id: 'ct-off', username: 'ctoff', displayName: 'C2', role: 'caretaker' },
			{ id: 'ct-other', username: 'ctother', displayName: 'C3', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: 'comp1', name: 'Comp' },
			{ id: 'comp-archived', name: 'Old', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: 'comp1', userId: 'ct-on' },
			{ companionId: 'comp-archived', userId: 'ct-on' },
			{ companionId: 'comp1', userId: 'ct-off' }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
		const now = Date.now();
		await db.insert(schema.caretakerShifts).values([
			{
				id: 'shift-on',
				userId: 'ct-on',
				startAt: new Date(now - 60 * 60 * 1000),
				endAt: new Date(now + 60 * 60 * 1000)
			},
			{
				id: 'shift-other',
				userId: 'ct-other',
				startAt: new Date(now - 60 * 60 * 1000),
				endAt: new Date(now + 60 * 60 * 1000)
			},
			{
				id: 'shift-off-past',
				userId: 'ct-off',
				startAt: new Date(now - 3 * 60 * 60 * 1000),
				endAt: new Date(now - 2 * 60 * 60 * 1000)
			}
		] as (typeof schema.caretakerShifts.$inferInsert)[]);
	});

	it('401 for anonymous', async () => {
		expect(await statusOf(assertCanWriteJournalMedia(locals(null), 'comp1'))).toBe(401);
	});

	it('allows admins and members for any date and archived companions', async () => {
		for (const user of [
			{ id: 'adm', role: 'admin' as const },
			{ id: 'mem', role: 'member' as const }
		]) {
			expect(await statusOf(assertCanWriteJournalMedia(locals(user), 'comp1', yesterday))).toBe(
				'ok'
			);
			expect(await statusOf(assertCanWriteJournalMedia(locals(user), 'comp-archived'))).toBe('ok');
		}
	});

	it('allows an assigned caretaker on shift, for today', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1'))).toBe('ok');
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe('ok');
	});

	it('403 for a caretaker on shift writing another date', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', yesterday))).toBe(403);
	});

	it('403 for an assigned caretaker off shift', async () => {
		const ct = locals({ id: 'ct-off', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1'))).toBe(403);
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe(403);
	});

	it('403 for an unassigned caretaker on shift', async () => {
		const ct = locals({ id: 'ct-other', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp1', today))).toBe(403);
	});

	it('403 for a caretaker on an archived companion', async () => {
		const ct = locals({ id: 'ct-on', role: 'caretaker' });
		expect(await statusOf(assertCanWriteJournalMedia(ct, 'comp-archived', today))).toBe(403);
	});
});

describe('assertCanWriteNoteMedia', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: 'nm-comp', name: 'NoteComp' },
			{ id: 'nm-archived', name: 'NoteOld', isActive: false },
			{ id: 'nm-other', name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.notes).values([
			{ id: 'nm-note', companionId: 'nm-comp', title: 'Cmds' },
			{ id: 'nm-note-arch', companionId: 'nm-archived', title: 'Old' }
		]);
		// ct-on (assigned + on shift from the journal block above) gets an
		// assignment here too, so the 403 comes from the role, not the assignment.
		await db.insert(schema.companionCaretakers).values({ companionId: 'nm-comp', userId: 'ct-on' });
	});

	const noteStatus = (user: { id: string; role: Role } | null, cid: string, nid: string) =>
		statusOf(assertCanWriteNoteMedia(locals(user), cid, nid).then(() => undefined));

	it('401 for anonymous', async () => {
		expect(await noteStatus(null, 'nm-comp', 'nm-note')).toBe(401);
	});

	it('403 for caretakers, even assigned and on shift', async () => {
		expect(await noteStatus({ id: 'ct-on', role: 'caretaker' }, 'nm-comp', 'nm-note')).toBe(403);
	});

	it('allows members and admins, including on archived companions', async () => {
		for (const user of [
			{ id: 'adm', role: 'admin' as const },
			{ id: 'mem', role: 'member' as const }
		]) {
			expect(await noteStatus(user, 'nm-comp', 'nm-note')).toBe('ok');
			expect(await noteStatus(user, 'nm-archived', 'nm-note-arch')).toBe('ok');
		}
	});

	it('404 when the note is missing or belongs to another companion', async () => {
		const mem = { id: 'mem', role: 'member' as const };
		expect(await noteStatus(mem, 'nm-comp', 'missing')).toBe(404);
		expect(await noteStatus(mem, 'nm-other', 'nm-note')).toBe(404);
	});

	it('returns the note', async () => {
		const res = await assertCanWriteNoteMedia(
			locals({ id: 'mem', role: 'member' }),
			'nm-comp',
			'nm-note'
		);
		expect(res.note).toEqual({ id: 'nm-note', companionId: 'nm-comp' });
	});
});

describe('checkIncidentWrite', () => {
	const mem = { id: 'mem', role: 'member' as const };
	const adm = { id: 'adm', role: 'admin' as const };
	const ctOn = { id: 'ct-on', role: 'caretaker' as const };
	const ctOff = { id: 'ct-off', role: 'caretaker' as const };
	const ctOther = { id: 'ct-other', role: 'caretaker' as const };
	const ctMid = { id: 'ct-mid', role: 'caretaker' as const };
	const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

	// Fixed local clock for the midnight cases: 00:10 on 15 June 2030.
	const MIDNIGHT = new Date(2030, 5, 15, 0, 10);

	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'ct-mid',
			username: 'ctmid',
			displayName: 'C4',
			role: 'caretaker'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values([
			{ id: 'in-comp', name: 'IncComp' },
			{ id: 'in-archived', name: 'IncOld', isActive: false }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.companionCaretakers).values([
			{ companionId: 'in-comp', userId: 'ct-on' },
			{ companionId: 'in-comp', userId: 'ct-off' },
			{ companionId: 'in-comp', userId: 'ct-mid' },
			{ companionId: 'in-archived', userId: 'ct-on' }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
		await db.insert(schema.caretakerShifts).values({
			id: 'shift-mid',
			userId: 'ct-mid',
			startAt: new Date(2030, 5, 14, 20, 0),
			endAt: new Date(2030, 5, 15, 4, 0)
		} as typeof schema.caretakerShifts.$inferInsert);
		await db.insert(schema.healthEvents).values([
			{
				id: 'inc-open',
				companionId: 'in-comp',
				type: 'incident',
				title: 'Limp',
				occurredAt: hoursAgo(2),
				loggedBy: 'mem'
			},
			{
				id: 'inc-by-ct',
				companionId: 'in-comp',
				type: 'incident',
				title: 'Cough',
				occurredAt: hoursAgo(1),
				loggedBy: 'ct-on',
				createdAt: new Date()
			},
			{
				id: 'inc-resolved',
				companionId: 'in-comp',
				type: 'incident',
				title: 'Old',
				occurredAt: hoursAgo(5),
				resolvedAt: hoursAgo(1),
				loggedBy: 'mem'
			},
			{
				id: 'inc-archived',
				companionId: 'in-archived',
				type: 'incident',
				title: 'Gone',
				occurredAt: hoursAgo(5),
				loggedBy: 'mem'
			},
			{
				id: 'inc-mid',
				companionId: 'in-comp',
				type: 'incident',
				title: 'Night',
				occurredAt: new Date(2030, 5, 14, 22, 0),
				loggedBy: 'ct-mid',
				createdAt: new Date(2030, 5, 14, 23, 30)
			},
			{
				id: 'inc-other',
				companionId: 'in-comp',
				type: 'incident',
				title: 'Other',
				occurredAt: hoursAgo(2),
				loggedBy: 'mem'
			},
			{
				id: 'ev-vet',
				companionId: 'in-comp',
				type: 'vet_visit',
				title: 'Vet',
				occurredAt: hoursAgo(2)
			}
		] as (typeof schema.healthEvents.$inferInsert)[]);
		await db.insert(schema.healthEventUpdates).values([
			{
				id: 'up-ct',
				healthEventId: 'inc-open',
				body: 'x',
				occurredAt: hoursAgo(1),
				loggedBy: 'ct-on',
				createdAt: new Date()
			},
			{
				id: 'up-mem',
				healthEventId: 'inc-open',
				body: 'x',
				occurredAt: hoursAgo(1),
				loggedBy: 'mem',
				createdAt: new Date()
			},
			{
				id: 'up-ct-resolved',
				healthEventId: 'inc-resolved',
				body: 'x',
				occurredAt: hoursAgo(2),
				loggedBy: 'ct-on',
				createdAt: new Date()
			},
			{
				id: 'up-elsewhere',
				healthEventId: 'inc-other',
				body: 'x',
				occurredAt: hoursAgo(1),
				loggedBy: 'ct-on',
				createdAt: new Date()
			},
			{
				id: 'up-mid',
				healthEventId: 'inc-mid',
				body: 'x',
				occurredAt: new Date(2030, 5, 14, 23, 30),
				loggedBy: 'ct-mid',
				createdAt: new Date(2030, 5, 14, 23, 30)
			},
			{
				id: 'up-mid-today',
				healthEventId: 'inc-mid',
				body: 'x',
				occurredAt: new Date(2030, 5, 15, 0, 5),
				loggedBy: 'ct-mid',
				createdAt: new Date(2030, 5, 15, 0, 5)
			}
		] as (typeof schema.healthEventUpdates.$inferInsert)[]);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	type User = { id: string; role: Role } | null;
	const check = (
		user: User,
		incidentId: string,
		action: IncidentWriteAction,
		updateId?: string,
		companionId = 'in-comp'
	) => checkIncidentWrite(user, companionId, incidentId, action, { updateId });
	const outcome = async (...args: Parameters<typeof check>) => {
		const r = await check(...args);
		return r.ok ? 'ok' : r.status;
	};

	const ALL: IncidentWriteAction[] = [
		'overview',
		'resolve',
		'link',
		'delete',
		'addUpdate',
		'editUpdate',
		'media'
	];

	it('401 for anonymous', async () => {
		const r = await check(null, 'inc-open', 'addUpdate');
		expect(r).toMatchObject({ ok: false, status: 401, key: 'error.unauthorized' });
	});

	it('members and admins may do every action, returning the incident', async () => {
		for (const user of [mem, adm]) {
			for (const action of ALL) {
				const r = await check(user, 'inc-open', action, 'up-mem');
				expect(r.ok).toBe(true);
				if (r.ok) expect(r.incident.id).toBe('inc-open');
			}
		}
	});

	it('member edits the overview of an incident on an archived companion', async () => {
		expect(await outcome(mem, 'inc-archived', 'overview', undefined, 'in-archived')).toBe('ok');
	});

	it('members may act on resolved incidents', async () => {
		expect(await outcome(mem, 'inc-resolved', 'overview')).toBe('ok');
		expect(await outcome(mem, 'inc-resolved', 'addUpdate')).toBe('ok');
	});

	it('404 for a missing incident', async () => {
		const r = await check(mem, 'nope', 'overview');
		expect(r).toMatchObject({ ok: false, status: 404, key: 'error.incidentNotFound' });
	});

	it('404 for an incident under another companion', async () => {
		expect(await outcome(mem, 'inc-open', 'overview', undefined, 'in-archived')).toBe(404);
	});

	it('404 for a non-incident event id', async () => {
		expect(await outcome(mem, 'ev-vet', 'overview')).toBe(404);
		expect(await outcome(ctOn, 'ev-vet', 'addUpdate')).toBe(404);
	});

	it('member editUpdate/media with an updateId from another incident is 404', async () => {
		expect(await outcome(mem, 'inc-open', 'editUpdate', 'up-elsewhere')).toBe(404);
		expect(await outcome(mem, 'inc-open', 'media', 'up-elsewhere')).toBe(404);
		expect(await outcome(mem, 'inc-open', 'editUpdate', 'missing')).toBe(404);
	});

	it('caretaker on shift and assigned may add an update to an open incident', async () => {
		expect(await outcome(ctOn, 'inc-open', 'addUpdate')).toBe('ok');
	});

	it('403 for a caretaker off shift', async () => {
		const r = await check(ctOff, 'inc-open', 'addUpdate');
		expect(r).toMatchObject({ ok: false, status: 403, key: 'error.noActiveShift' });
	});

	it('403 for an unassigned caretaker on shift', async () => {
		const r = await check(ctOther, 'inc-open', 'addUpdate');
		expect(r).toMatchObject({ ok: false, status: 403, key: 'error.notAssignedToCompanion' });
	});

	it('403 for a caretaker on an incident of an archived companion', async () => {
		expect(await outcome(ctOn, 'inc-archived', 'addUpdate', undefined, 'in-archived')).toBe(403);
	});

	it('403 for a caretaker on overview, resolve, link and delete', async () => {
		for (const action of ['overview', 'resolve', 'link', 'delete'] as const) {
			expect(await outcome(ctOn, 'inc-open', action)).toBe(403);
		}
	});

	it('404 for a caretaker addUpdate on a resolved incident', async () => {
		const r = await check(ctOn, 'inc-resolved', 'addUpdate');
		expect(r).toMatchObject({ ok: false, status: 404, key: 'error.incidentNotFound' });
	});

	it('404 for a caretaker editing their own update on a resolved incident', async () => {
		expect(await outcome(ctOn, 'inc-resolved', 'editUpdate', 'up-ct-resolved')).toBe(404);
	});

	it('caretaker overview media: ok on an incident they logged today', async () => {
		expect(await outcome(ctOn, 'inc-by-ct', 'media')).toBe('ok');
	});

	it('caretaker overview media: 403 on an incident a member logged', async () => {
		expect(await outcome(ctOn, 'inc-open', 'media')).toBe(403);
	});

	it('caretaker overview media: 403 on an incident they logged yesterday', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(MIDNIGHT);
		expect(await outcome(ctMid, 'inc-mid', 'media')).toBe(403);
	});

	it('caretaker editUpdate on their own update from today is ok', async () => {
		expect(await outcome(ctOn, 'inc-open', 'editUpdate', 'up-ct')).toBe('ok');
	});

	it('caretaker media with updateId on their own update from today is ok', async () => {
		expect(await outcome(ctOn, 'inc-open', 'media', 'up-ct')).toBe('ok');
	});

	it('403 for a caretaker editing their own update created yesterday at 23:30 (clock 00:10)', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(MIDNIGHT);
		expect(await outcome(ctMid, 'inc-mid', 'editUpdate', 'up-mid')).toBe(403);
		expect(await outcome(ctMid, 'inc-mid', 'media', 'up-mid')).toBe(403);
		// An update logged after midnight is still editable.
		expect(await outcome(ctMid, 'inc-mid', 'editUpdate', 'up-mid-today')).toBe('ok');
	});

	it('honors an explicit now option', async () => {
		const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
		const r = await checkIncidentWrite(ctOn, 'in-comp', 'inc-open', 'editUpdate', {
			updateId: 'up-ct',
			now: tomorrow
		});
		expect(r).toMatchObject({ ok: false, status: 403 });
	});

	it("403 for a caretaker editing another user's update", async () => {
		expect(await outcome(ctOn, 'inc-open', 'editUpdate', 'up-mem')).toBe(403);
		expect(await outcome(ctOn, 'inc-open', 'media', 'up-mem')).toBe(403);
	});

	it('404 for a caretaker with an updateId from another incident', async () => {
		expect(await outcome(ctOn, 'inc-open', 'editUpdate', 'up-elsewhere')).toBe(404);
		expect(await outcome(ctOn, 'inc-open', 'media', 'up-elsewhere')).toBe(404);
	});

	it('403 for a caretaker editUpdate without an updateId', async () => {
		expect(await outcome(ctOn, 'inc-open', 'editUpdate')).toBe(403);
	});
});

describe('assertCanWriteIncident', () => {
	it('returns the incident on success', async () => {
		const row = await assertCanWriteIncident(
			locals({ id: 'mem', role: 'member' }),
			'in-comp',
			'inc-open',
			'overview'
		);
		expect(row.id).toBe('inc-open');
	});

	it('throws with the status and localized message', async () => {
		const fail = (e: unknown) => e as { status: number; body: { message: string } };
		const err = await assertCanWriteIncident(
			locals({ id: 'mem', role: 'member' }),
			'in-comp',
			'nope',
			'overview'
		).catch(fail);
		expect(fail(err).status).toBe(404);
		expect(fail(err).body.message).toBe('Incident not found.');
		const err401 = await assertCanWriteIncident(
			locals(null),
			'in-comp',
			'inc-open',
			'overview'
		).catch(fail);
		expect(fail(err401).status).toBe(401);
	});
});
