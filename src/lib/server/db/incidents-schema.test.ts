import { describe, it, expect, beforeAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';

const C = 'c-inc';
const U = 'u-inc';
const base = { filename: 'f.jpg', mimeType: 'image/jpeg', sizeBytes: 1 } as const;

async function expectCheckFailure(p: Promise<unknown>) {
	const err = await p.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).not.toBeNull();
	const e = err as Error;
	expect(`${e.message} ${String(e.cause ?? '')}`).toMatch(/CHECK constraint failed/);
}

async function makeIncident(id: string) {
	await db.insert(schema.healthEvents).values({
		id,
		companionId: C,
		type: 'incident',
		title: 'Limping',
		severity: 'mild',
		occurredAt: new Date('2026-05-01T10:00:00Z')
	});
}

async function makeUpdate(id: string, incidentId: string, body = 'Better today') {
	await db.insert(schema.healthEventUpdates).values({
		id,
		healthEventId: incidentId,
		body,
		occurredAt: new Date('2026-05-02T10:00:00Z'),
		loggedBy: U
	});
}

function searchRows(term: string) {
	return db.all<{
		entity_type: string;
		entity_id: string;
		title: string;
		companion_id: string;
	}>(
		sql`SELECT entity_type, entity_id, title, companion_id FROM search_index WHERE search_index MATCH ${term}`
	);
}

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: U, username: 'inc', displayName: 'Inc', role: 'member' });
	await db.insert(schema.companions).values({ id: C, name: 'Ein' });
});

describe('incident schema', () => {
	it('deleting an update deletes its media rows', async () => {
		await makeIncident('i-1');
		await makeUpdate('up-1', 'i-1');
		await db.insert(schema.media).values([
			{ id: 'm-ov', healthEventId: 'i-1', ...base },
			{ id: 'm-up', healthEventId: 'i-1', updateId: 'up-1', ...base }
		]);
		await db.delete(schema.healthEventUpdates).where(eq(schema.healthEventUpdates.id, 'up-1'));
		expect(await db.select().from(schema.media).where(eq(schema.media.id, 'm-up'))).toHaveLength(0);
		expect(await db.select().from(schema.media).where(eq(schema.media.id, 'm-ov'))).toHaveLength(1);
	});

	it('deleting an incident deletes updates, links and media', async () => {
		await makeIncident('i-2');
		await db.insert(schema.healthEvents).values({
			id: 'e-2',
			companionId: C,
			type: 'vet_visit',
			title: 'Visit',
			occurredAt: new Date('2026-05-03T10:00:00Z')
		});
		await makeUpdate('up-2', 'i-2', 'quokkaburrow');
		const [upRow] = await db
			.select()
			.from(schema.healthEventUpdates)
			.where(eq(schema.healthEventUpdates.id, 'up-2'));
		const searchDate = db.all<{ event_date: string }>(
			sql`SELECT event_date FROM search_index WHERE entity_type = 'incident_update' AND entity_id = 'up-2'`
		);
		expect(searchDate).toEqual([{ event_date: localDateISO(upRow.occurredAt) }]);
		await db.insert(schema.healthEventLinks).values({ incidentId: 'i-2', healthEventId: 'e-2' });
		await db.insert(schema.media).values([
			{ id: 'm-2a', healthEventId: 'i-2', ...base },
			{ id: 'm-2b', healthEventId: 'i-2', updateId: 'up-2', ...base }
		]);
		await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, 'i-2'));
		expect(searchRows('quokkaburrow')).toHaveLength(0);
		expect(
			await db
				.select()
				.from(schema.healthEventUpdates)
				.where(eq(schema.healthEventUpdates.id, 'up-2'))
		).toHaveLength(0);
		expect(
			await db
				.select()
				.from(schema.healthEventLinks)
				.where(eq(schema.healthEventLinks.incidentId, 'i-2'))
		).toHaveLength(0);
		expect(
			await db.select().from(schema.media).where(eq(schema.media.healthEventId, 'i-2'))
		).toHaveLength(0);
		// The linked event itself survives.
		expect(
			await db.select().from(schema.healthEvents).where(eq(schema.healthEvents.id, 'e-2'))
		).toHaveLength(1);
	});

	it('health_event_links rejects self link', async () => {
		await makeIncident('i-3');
		await expectCheckFailure(
			db.insert(schema.healthEventLinks).values({ incidentId: 'i-3', healthEventId: 'i-3' })
		);
	});

	it('update body is indexed for search', async () => {
		await makeIncident('i-4');
		await makeUpdate('up-4', 'i-4', 'zebrafinch');
		expect(searchRows('zebrafinch')).toEqual([
			{ entity_type: 'incident_update', entity_id: 'up-4', title: '', companion_id: C }
		]);
		await db
			.update(schema.healthEventUpdates)
			.set({ body: 'otterpup' })
			.where(eq(schema.healthEventUpdates.id, 'up-4'));
		expect(searchRows('zebrafinch')).toHaveLength(0);
		expect(searchRows('otterpup')).toHaveLength(1);
		await db.delete(schema.healthEventUpdates).where(eq(schema.healthEventUpdates.id, 'up-4'));
		expect(searchRows('otterpup')).toHaveLength(0);
	});

	it('users.notify_incident_email defaults on', async () => {
		const [u] = await db.select().from(schema.users).where(eq(schema.users.id, U));
		expect(u.notifyIncidentEmail).toBe(true);
	});
});
