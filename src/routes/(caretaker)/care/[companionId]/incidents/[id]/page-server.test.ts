import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { load, actions } from './+page.server';

// Caretaker incident page: the load checks the assignment itself (there is no
// care/[companionId] layout doing it) and only shows open incidents; the
// update actions go through checkIncidentWrite.

const C = 'cid-comp';
const OTHER = 'cid-other';
const ON = 'cid-on';
const OFF = 'cid-off';
const MEM = 'cid-mem';
type Action = (typeof actions)[keyof typeof actions];

function call(
	action: Action,
	userId: string,
	id: string,
	fields: Record<string, string> = {},
	companionId = C
) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return action({
		params: { companionId, id },
		request: new Request('http://localhost/', { method: 'POST', body: fd }),
		locals: { user: { id: userId, role: 'caretaker' }, locale: 'en' }
	} as unknown as Parameters<Action>[0]);
}

const status = (r: unknown) => (r as { status?: number } | undefined)?.status;

async function thrown(p: unknown) {
	try {
		await p;
		return null;
	} catch (e) {
		return e as { status: number };
	}
}

function callLoad(id: string, assigned: string[], companionId = C) {
	return load({
		params: { companionId, id },
		locals: { user: { id: ON, role: 'caretaker' }, locale: 'en' },
		parent: async () => ({
			companions: assigned.map((cid) => ({ id: cid, name: cid })),
			isOnShift: true
		})
	} as unknown as Parameters<typeof load>[0]);
}

const updates = (incidentId: string) =>
	db.query.healthEventUpdates.findMany({
		where: eq(schema.healthEventUpdates.healthEventId, incidentId)
	});

describe('caretaker incident page', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: ON, username: ON, displayName: 'On', role: 'caretaker' },
			{ id: OFF, username: OFF, displayName: 'Off', role: 'caretaker' },
			{ id: MEM, username: MEM, displayName: 'Mem', role: 'member' }
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
			id: 'cid-shift',
			userId: ON,
			startAt: new Date(now - 60 * 60 * 1000),
			endAt: new Date(now + 60 * 60 * 1000)
		} as typeof schema.caretakerShifts.$inferInsert);
		await db.insert(schema.healthEvents).values([
			{
				id: 'cid-open',
				companionId: C,
				type: 'incident',
				title: 'Limp',
				occurredAt: new Date(now - 2 * 60 * 60 * 1000),
				loggedBy: MEM
			},
			{
				id: 'cid-resolved',
				companionId: C,
				type: 'incident',
				title: 'Itch',
				occurredAt: new Date(now - 48 * 60 * 60 * 1000),
				resolvedAt: new Date(now - 60 * 60 * 1000),
				loggedBy: MEM
			},
			{
				id: 'cid-other-inc',
				companionId: OTHER,
				type: 'incident',
				title: 'Other',
				occurredAt: new Date(now - 60 * 60 * 1000),
				loggedBy: MEM
			}
		] as (typeof schema.healthEvents.$inferInsert)[]);
		await db.insert(schema.healthEventUpdates).values({
			id: 'cid-mem-update',
			healthEventId: 'cid-open',
			body: 'Owner note',
			occurredAt: new Date(now - 60 * 60 * 1000),
			loggedBy: MEM
		});
		await db.insert(schema.documents).values({
			id: 'cid-doc',
			companionId: C,
			healthEventId: 'cid-open',
			title: 'Invoice',
			filename: 'cid-doc.pdf',
			storageKey: 'documents/cid-doc.pdf',
			mimeType: 'application/pdf'
		} as typeof schema.documents.$inferInsert);
	});

	it('load: 403 for an unassigned companion, even for an open incident', async () => {
		expect((await thrown(callLoad('cid-other-inc', [C], OTHER)))?.status).toBe(403);
	});

	it('load: 404 for a resolved incident or one under another companion', async () => {
		expect((await thrown(callLoad('cid-resolved', [C])))?.status).toBe(404);
		expect((await thrown(callLoad('cid-other-inc', [C, OTHER])))?.status).toBe(404);
	});

	it('load: open incident without documents', async () => {
		const data = (await callLoad('cid-open', [C])) as {
			detail: { incident: { id: string }; documents: unknown[]; journalDates: unknown[] };
		};
		expect(data.detail.incident.id).toBe('cid-open');
		expect(data.detail.documents).toEqual([]);
		expect(data.detail.journalDates).toEqual([]);
	});

	it('addUpdate: on shift logs "now", ignoring a posted time', async () => {
		const before = Date.now() - 1000;
		const res = (await call(actions.addUpdate, ON, 'cid-open', {
			body: 'Ate breakfast',
			occurredAt: new Date(2020, 0, 1).toISOString()
		})) as { updateId: string };
		expect(res.updateId).toBeTruthy();
		const row = (await updates('cid-open')).find((u) => u.id === res.updateId);
		expect(row).toMatchObject({ body: 'Ate breakfast', loggedBy: ON });
		expect(row!.occurredAt.getTime()).toBeGreaterThanOrEqual(Math.floor(before / 1000) * 1000);
	});

	it('addUpdate: 403 off shift, 403 unassigned, 404 resolved', async () => {
		expect(status(await call(actions.addUpdate, OFF, 'cid-open', { body: 'x' }))).toBe(403);
		expect(status(await call(actions.addUpdate, ON, 'cid-other-inc', { body: 'x' }, OTHER))).toBe(
			403
		);
		expect(status(await call(actions.addUpdate, ON, 'cid-resolved', { body: 'x' }))).toBe(404);
	});

	it('edit and delete: own update only, and an update id is required', async () => {
		expect(status(await call(actions.editUpdate, ON, 'cid-open', { body: 'y' }))).toBe(404);
		expect(
			status(
				await call(actions.editUpdate, ON, 'cid-open', { updateId: 'cid-mem-update', body: 'y' })
			)
		).toBe(403);
		expect(
			status(await call(actions.deleteUpdate, ON, 'cid-open', { updateId: 'cid-mem-update' }))
		).toBe(403);
		expect((await updates('cid-open')).find((u) => u.id === 'cid-mem-update')?.body).toBe(
			'Owner note'
		);

		const own = (await call(actions.addUpdate, ON, 'cid-open', { body: 'Mine' })) as {
			updateId: string;
		};
		const at = new Date(Date.now() - 30 * 60 * 1000);
		at.setMilliseconds(0);
		await db
			.update(schema.healthEventUpdates)
			.set({ occurredAt: at })
			.where(eq(schema.healthEventUpdates.id, own.updateId));
		await call(actions.editUpdate, ON, 'cid-open', {
			updateId: own.updateId,
			body: 'Mine, edited'
		});
		const edited = (await updates('cid-open')).find((u) => u.id === own.updateId);
		expect(edited?.body).toBe('Mine, edited');
		// The edit keeps the update's time; caretakers never set it.
		expect(edited?.occurredAt.getTime()).toBe(at.getTime());
		await call(actions.deleteUpdate, ON, 'cid-open', { updateId: own.updateId });
		expect((await updates('cid-open')).find((u) => u.id === own.updateId)).toBeUndefined();
	});

	it('owner-only actions do not exist on the caretaker page', () => {
		expect(Object.keys(actions).sort()).toEqual(['addUpdate', 'deleteUpdate', 'editUpdate']);
	});
});
