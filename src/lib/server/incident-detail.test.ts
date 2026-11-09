import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { loadIncidentDetail } from './incident-detail';

const C = 'c-idt';
const OTHER = 'c-idt-other';
const d = (n: number) => new Date(n * 1000);

function media(id: string, healthEventId: string, updateId: string | null) {
	return {
		id,
		healthEventId,
		updateId,
		filename: `${id}.jpg`,
		provider: 'local' as const,
		storageKey: `health/${C}/${healthEventId}/${id}.jpg`,
		mediaType: 'photo' as const,
		mimeType: 'image/jpeg',
		sizeBytes: 10
	};
}

function doc(id: string, healthEventId: string) {
	return {
		id,
		companionId: C,
		healthEventId,
		filename: `${id}.pdf`,
		provider: 'local' as const,
		storageKey: `documents/${C}/${id}.pdf`,
		title: `Doc ${id}`,
		category: 'medical' as const,
		mimeType: 'application/pdf'
	};
}

describe('loadIncidentDetail', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'u-idt', username: 'u-idt', displayName: 'Dave', role: 'member' },
			{ id: 'u-idt-ct', username: 'u-idt-ct', displayName: 'Sam', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
		await db.insert(schema.companions).values([
			{ id: C, name: 'Ein' },
			{ id: OTHER, name: 'Other' }
		] as (typeof schema.companions.$inferInsert)[]);
		await db.insert(schema.healthEvents).values([
			{
				id: 'inc',
				companionId: C,
				type: 'incident',
				title: 'Limping',
				notes: 'After the hike',
				severity: 'moderate',
				occurredAt: d(1000),
				loggedBy: 'u-idt'
			},
			{
				id: 'inc-res',
				companionId: C,
				type: 'incident',
				title: 'Cough',
				occurredAt: d(1000),
				resolvedAt: d(9000)
			},
			{
				id: 'vet',
				companionId: C,
				type: 'vet_visit',
				title: 'Riverside',
				occurredAt: d(2500),
				vetClinic: 'Riverside Animal Clinic'
			},
			{ id: 'vet-res', companionId: C, type: 'vet_visit', title: 'Check', occurredAt: d(9500) },
			{ id: 'o-inc', companionId: OTHER, type: 'incident', title: 'X', occurredAt: d(1) }
		] as (typeof schema.healthEvents.$inferInsert)[]);
		await db.insert(schema.healthEventUpdates).values([
			{
				id: 'up-late',
				healthEventId: 'inc',
				body: 'Better',
				severity: 'mild',
				occurredAt: d(3000),
				loggedBy: 'u-idt-ct'
			},
			{ id: 'up-early', healthEventId: 'inc', body: 'Worse', occurredAt: d(2000) },
			{ id: 'up-res', healthEventId: 'inc-res', body: 'Gone', occurredAt: d(8000) }
		] as (typeof schema.healthEventUpdates.$inferInsert)[]);
		await db.insert(schema.healthEventLinks).values([
			{ incidentId: 'inc', healthEventId: 'vet' },
			{ incidentId: 'inc-res', healthEventId: 'vet-res' }
		]);
		await db
			.insert(schema.media)
			.values([media('m-ov', 'inc', null), media('m-up', 'inc', 'up-late')]);
		await db.insert(schema.documents).values([doc('d-inc', 'inc'), doc('d-vet', 'vet')]);
		await db.insert(schema.journalEntries).values({ id: 'j1', companionId: C, date: '2026-11-05' });
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'j1', healthEventId: 'inc' });
	});

	it('returns null for a missing id, a non-incident, or another companion', async () => {
		expect(await loadIncidentDetail(C, 'nope', 'owner')).toBeNull();
		expect(await loadIncidentDetail(C, 'vet', 'owner')).toBeNull();
		expect(await loadIncidentDetail(C, 'o-inc', 'owner')).toBeNull();
		expect(await loadIncidentDetail(OTHER, 'inc', 'owner')).toBeNull();
	});

	it('mixes updates and linked events by occurredAt', async () => {
		const data = await loadIncidentDetail(C, 'inc', 'owner');
		expect(data).not.toBeNull();
		const order = data!.timeline.map((i) =>
			i.kind === 'update' ? i.update.id : i.kind === 'event' ? i.event.id : 'resolved'
		);
		expect(order).toEqual(['up-early', 'vet', 'up-late']);
		expect(data!.currentSeverity).toBe('mild');
		expect(data!.incident).toMatchObject({
			id: 'inc',
			title: 'Limping',
			notes: 'After the hike',
			severity: 'moderate',
			resolvedAt: null,
			logger: { displayName: 'Dave' }
		});
		const late = data!.timeline.find((i) => i.kind === 'update' && i.update.id === 'up-late');
		expect(late?.kind === 'update' && late.update.logger).toEqual({ displayName: 'Sam' });
		expect(late?.kind === 'update' && late.update.media.map((m) => m.id)).toEqual(['m-up']);
		expect(data!.overviewMedia.map((m) => m.id)).toEqual(['m-ov']);
	});

	it('puts the resolution last, even before a later linked event', async () => {
		const data = await loadIncidentDetail(C, 'inc-res', 'owner');
		const kinds = data!.timeline.map((i) => i.kind);
		expect(kinds).toEqual(['update', 'event', 'resolved']);
		const last = data!.timeline.at(-1);
		expect(last?.kind === 'resolved' && last.at).toEqual(d(9000));
	});

	it('owner view includes documents on the incident and on linked events, and journal dates', async () => {
		const data = await loadIncidentDetail(C, 'inc', 'owner');
		expect(data!.documents.map((x) => x.id)).toEqual(['d-inc']);
		const vet = data!.timeline.find((i) => i.kind === 'event');
		expect(vet?.kind === 'event' && vet.documents.map((x) => x.id)).toEqual(['d-vet']);
		expect(vet?.kind === 'event' && vet.event.vetClinic).toBe('Riverside Animal Clinic');
		expect(data!.journalDates).toEqual(['2026-11-05']);
	});

	it('caretaker view strips documents and journal dates', async () => {
		const data = await loadIncidentDetail(C, 'inc', 'caretaker');
		expect(data).not.toBeNull();
		expect(data!.documents).toEqual([]);
		expect(data!.journalDates).toEqual([]);
		const vet = data!.timeline.find((i) => i.kind === 'event');
		expect(vet?.kind === 'event' && vet.documents).toEqual([]);
		expect(vet?.kind === 'event' && vet.event.title).toBe('Riverside');
	});

	it('caretaker view is null for a resolved incident', async () => {
		expect(await loadIncidentDetail(C, 'inc-res', 'caretaker')).toBeNull();
	});

	it('never exposes storage keys', async () => {
		const data = await loadIncidentDetail(C, 'inc', 'owner');
		expect(JSON.stringify(data)).not.toMatch(/storageKey|originalKey|health\/c-idt/);
	});
});
