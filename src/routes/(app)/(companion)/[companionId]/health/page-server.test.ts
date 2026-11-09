import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { load } from './+page.server';

const companionId = 'hp-links';
const other = 'hp-other';

function run(search = '', id = companionId) {
	return load({
		params: { companionId: id },
		url: new URL(`http://localhost/${id}/health${search}`),
		locals: { user: { id: 'u', role: 'member' }, locale: 'en' },
		parent: async () => ({ companion: { id } })
	} as unknown as Parameters<typeof load>[0]) as Promise<{
		journalDatesByEvent: Record<string, string[]>;
		openIncidents: { id: string }[];
	}>;
}

async function redirectOf(search: string): Promise<{ status: number; location: string } | null> {
	try {
		await run(search);
		return null;
	} catch (e) {
		const r = e as { status?: number; location?: string };
		if (r.status && r.location) return { status: r.status, location: r.location };
		throw e;
	}
}

describe('health page load', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: companionId, name: 'HP' },
			{ id: other, name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values([
			{
				id: 'hp-ev',
				companionId,
				type: 'vet_visit',
				title: 'Visit',
				occurredAt: new Date(2026, 0, 5, 12)
			},
			{ id: 'hp-inc', companionId, type: 'incident', title: 'Limp', occurredAt: new Date() },
			{
				id: 'hp-inc-res',
				companionId,
				type: 'incident',
				title: 'Cough',
				occurredAt: new Date(2026, 0, 1),
				resolvedAt: new Date(2026, 0, 3)
			},
			{ id: 'hp-o-inc', companionId: other, type: 'incident', title: 'X', occurredAt: new Date() }
		] as (typeof schema.healthEvents.$inferInsert)[]);
		await db.insert(schema.healthEventUpdates).values([
			{ id: 'hp-up', healthEventId: 'hp-inc', body: 'Better', occurredAt: new Date() },
			{ id: 'hp-o-up', healthEventId: 'hp-o-inc', body: 'Y', occurredAt: new Date() }
		] as (typeof schema.healthEventUpdates.$inferInsert)[]);
		await db.insert(schema.journalEntries).values({ id: 'hp-e', companionId, date: '2026-01-09' });
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'hp-e', healthEventId: 'hp-ev' });
	});

	it('returns the linking days per event', async () => {
		const data = await run();
		expect(data.journalDatesByEvent).toEqual({ 'hp-ev': ['2026-01-09'] });
	});

	it('returns open incidents only', async () => {
		const data = await run();
		expect(data.openIncidents.map((i) => i.id)).toEqual(['hp-inc']);
	});

	it('sends ?detailHealth= for an incident to its page', async () => {
		expect(await redirectOf('?detailHealth=hp-inc-res')).toEqual({
			status: 303,
			location: `/${companionId}/health/incidents/hp-inc-res`
		});
	});

	it('keeps ?detailHealth= for other types and other companions on the Health Log', async () => {
		expect(await redirectOf('?detailHealth=hp-ev')).toBeNull();
		expect(await redirectOf('?detailHealth=hp-o-inc')).toBeNull();
	});

	it('sends ?incidentUpdate= to the incident page at that update', async () => {
		expect(await redirectOf('?incidentUpdate=hp-up')).toEqual({
			status: 303,
			location: `/${companionId}/health/incidents/hp-inc#update-hp-up`
		});
	});

	it("ignores ?incidentUpdate= for another companion's update", async () => {
		expect(await redirectOf('?incidentUpdate=hp-o-up')).toBeNull();
		expect(await redirectOf('?incidentUpdate=missing')).toBeNull();
	});
});
