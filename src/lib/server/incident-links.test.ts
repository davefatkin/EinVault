import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import {
	linkToIncident,
	unlinkFromIncident,
	listLinkedEvents,
	listIncidentsForEvent,
	listLinkCandidates,
	listIncidentCandidates
} from './incident-links';

const C = 'c-il';
const OTHER = 'c-il-other';
const d = (n: number) => new Date(n * 1000);

describe('incident links', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: C, name: 'A' },
			{ id: OTHER, name: 'B' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values([
			{ id: 'inc1', companionId: C, type: 'incident', title: 'Limp', occurredAt: d(1000) },
			{
				id: 'inc2',
				companionId: C,
				type: 'incident',
				title: 'Cough',
				occurredAt: d(2000),
				resolvedAt: d(3000)
			},
			{ id: 'inc3', companionId: C, type: 'incident', title: 'Itch', occurredAt: d(500) },
			{ id: 'vet1', companionId: C, type: 'vet_visit', title: 'Vet', occurredAt: d(1500) },
			{ id: 'vet2', companionId: C, type: 'vet_visit', title: 'Vet 2', occurredAt: d(1200) },
			{ id: 'vet3', companionId: C, type: 'vaccination', title: 'Shot', occurredAt: d(1800) },
			{ id: 'o-vet', companionId: OTHER, type: 'vet_visit', title: 'X', occurredAt: d(1) },
			{ id: 'o-inc', companionId: OTHER, type: 'incident', title: 'Y', occurredAt: d(1) }
		] as (typeof schema.healthEvents.$inferInsert)[]);
	});

	it('links and lists both directions, ascending by occurredAt', async () => {
		expect(await linkToIncident(C, 'inc1', 'vet1')).toBe('linked');
		expect(await linkToIncident(C, 'inc1', 'vet2')).toBe('linked');
		expect(await linkToIncident(C, 'inc2', 'vet1')).toBe('linked');
		const linked = await listLinkedEvents(C, 'inc1');
		expect(linked.map((e) => e.id)).toEqual(['vet2', 'vet1']);
		expect(linked[0]).toMatchObject({ type: 'vet_visit', title: 'Vet 2', notes: null });
		const inc = await listIncidentsForEvent(C, 'vet1');
		expect(inc.map((i) => i.id).sort()).toEqual(['inc1', 'inc2']);
		expect(inc.find((i) => i.id === 'inc2')?.resolvedAt).toEqual(d(3000));
	});

	it('rejects cross-companion links', async () => {
		expect(await linkToIncident(C, 'inc1', 'o-vet')).toBe('notFound');
		expect(await linkToIncident(C, 'o-inc', 'vet1')).toBe('notFound');
		expect(await linkToIncident(OTHER, 'o-inc', 'vet1')).toBe('notFound');
		expect(await linkToIncident(C, 'nope', 'vet1')).toBe('notFound');
		expect(await linkToIncident(C, 'inc1', 'nope')).toBe('notFound');
	});

	it('rejects incident to incident, non-incident parent, and self link', async () => {
		expect(await linkToIncident(C, 'inc1', 'inc2')).toBe('invalid');
		expect(await linkToIncident(C, 'vet1', 'vet2')).toBe('invalid');
		expect(await linkToIncident(C, 'vet1', 'vet1')).toBe('invalid');
		expect(await linkToIncident(C, 'inc1', 'inc1')).toBe('invalid');
	});

	it('duplicate link is a no-op', async () => {
		expect(await linkToIncident(C, 'inc1', 'vet1')).toBe('linked');
		const rows = await db.select().from(schema.healthEventLinks);
		expect(rows.filter((r) => r.incidentId === 'inc1' && r.healthEventId === 'vet1')).toHaveLength(
			1
		);
	});

	it('candidates exclude linked and wrong-type rows', async () => {
		const ev = await listLinkCandidates(C, 'inc1');
		expect(ev.map((e) => e.id)).toEqual(['vet3']);
		const ev2 = await listLinkCandidates(C, 'inc3');
		expect(ev2.map((e) => e.id)).toEqual(['vet3', 'vet1', 'vet2']);
		const inc = await listIncidentCandidates(C, 'vet1');
		expect(inc.map((i) => i.id)).toEqual(['inc3']);
		const inc2 = await listIncidentCandidates(C, 'vet3');
		expect(inc2.map((i) => i.id)).toEqual(['inc1', 'inc3', 'inc2']);
	});

	it('unlink removes the link', async () => {
		expect(await unlinkFromIncident(C, 'inc1', 'vet2')).toBe(true);
		expect(await unlinkFromIncident(C, 'inc1', 'vet2')).toBe(false);
		expect((await listLinkedEvents(C, 'inc1')).map((e) => e.id)).toEqual(['vet1']);
		expect(await unlinkFromIncident(OTHER, 'inc1', 'vet1')).toBe(false);
	});
});
