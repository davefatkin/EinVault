import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { buildMatchQuery, search } from './search';

describe('buildMatchQuery', () => {
	it('rejects short and empty input', () => {
		expect(buildMatchQuery('')).toBeNull();
		expect(buildMatchQuery(' a ')).toBeNull();
	});

	it('quotes and prefixes tokens', () => {
		expect(buildMatchQuery('vet visit')).toBe('"vet"* "visit"*');
	});

	it('neutralizes fts operators and quotes', () => {
		expect(buildMatchQuery('a" OR "b')).toBe('"a"* "OR"* "b"*');
		expect(buildMatchQuery('NEAR(x y)')).toBe('"NEAR(x"* "y)"*');
		expect(buildMatchQuery('""')).toBeNull();
		expect(buildMatchQuery('" "')).toBeNull();
	});
});

describe('search index + query', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'u-s',
			username: 'search-user',
			displayName: 'S User',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({
			id: 'c-s',
			name: 'Searchy'
		} as typeof schema.companions.$inferInsert);
	});

	it('triggers index journal inserts, updates, deletes', async () => {
		await db.insert(schema.journalEntries).values({
			id: 'j-s1',
			companionId: 'c-s',
			date: '2026-04-01',
			body: 'zephyr quince walk',
			loggedBy: 'u-s'
		} as typeof schema.journalEntries.$inferInsert);
		expect(search('zephyr').length).toBe(1);
		expect(search('zephyr')[0]).toMatchObject({
			type: 'journal',
			companionName: 'Searchy',
			href: '/c-s/journal/2026-04-01'
		});

		const { eq } = await import('drizzle-orm');
		await db
			.update(schema.journalEntries)
			.set({ body: 'flummox walk' })
			.where(eq(schema.journalEntries.id, 'j-s1'));
		expect(search('zephyr').length).toBe(0);
		expect(search('flummox').length).toBe(1);

		await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, 'j-s1'));
		expect(search('flummox').length).toBe(0);
	});

	it('indexes every entity type', async () => {
		await db.insert(schema.healthEvents).values({
			id: 'h-s1',
			companionId: 'c-s',
			title: 'xylograph checkup',
			type: 'vet_visit',
			occurredAt: new Date('2026-04-02T10:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.healthEvents.$inferInsert);
		await db.insert(schema.reminders).values({
			id: 'r-s1',
			companionId: 'c-s',
			title: 'quibble pill',
			type: 'medication',
			dueAt: new Date('2026-04-03T09:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.reminders.$inferInsert);
		await db.insert(schema.dailyEvents).values({
			id: 'd-s1',
			companionId: 'c-s',
			type: 'walk',
			notes: 'gargoyle sighting',
			loggedAt: new Date('2026-04-04T12:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.dailyEvents.$inferInsert);
		await db.insert(schema.weightEntries).values({
			id: 'w-s1',
			companionId: 'c-s',
			weight: 12,
			unit: 'kg',
			notes: 'plimsoll weigh-in',
			recordedAt: new Date('2026-04-05T12:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.weightEntries.$inferInsert);

		expect(search('xylograph')[0]?.type).toBe('health');
		expect(search('quibble')[0]?.type).toBe('reminder');
		expect(search('gargoyle')[0]?.type).toBe('daily');
		expect(search('plimsoll')[0]?.type).toBe('weight');
		// health event_date derived from occurredAt
		expect(search('xylograph')[0]?.date).toBe('2026-04-02');
	});

	it('snippet carries sentinel markers around the match', () => {
		const r = search('gargoyle')[0];
		expect(r.snippet).toContain('\x01gargoyle\x02');
	});

	it('ranks the stronger match first', async () => {
		await db.insert(schema.journalEntries).values([
			{
				id: 'j-s2',
				companionId: 'c-s',
				date: '2026-04-06',
				body: 'brontide brontide brontide',
				loggedBy: 'u-s'
			},
			{
				id: 'j-s3',
				companionId: 'c-s',
				date: '2026-04-07',
				body: 'one brontide among many other plain words here',
				loggedBy: 'u-s'
			}
		] as (typeof schema.journalEntries.$inferInsert)[]);
		const results = search('brontide');
		expect(results[0].id).toBe('j-s2');
	});
});
