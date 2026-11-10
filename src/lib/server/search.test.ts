import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { localDateISO } from '#lib/date.js';
import { search, buildMatchQuery, buildFilterClause, hasActiveFilters } from './search';
import type { SearchFilters, SearchResult } from './search';
import { createSupply, updateSupply, deleteSupply, type SupplyInput } from './supplies';

function q(partial: Partial<SearchFilters>): SearchFilters {
	return { text: '', companionIds: [], types: [], ...partial };
}

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

describe('buildFilterClause', () => {
	it('is empty for no filters', () => {
		expect(buildFilterClause(q({}))).toEqual({ sql: '', params: [] });
	});
	it('ORs within a kind, ANDs across kinds, params in order', () => {
		const r = buildFilterClause(
			q({
				companionIds: ['c1', 'c2'],
				types: ['health'],
				after: '2026-01-01',
				before: '2026-12-31'
			})
		);
		expect(r.sql).toBe(
			's.companion_id IN (?, ?) AND s.entity_type IN (?, ?) AND s.event_date >= ? AND s.event_date <= ?'
		);
		expect(r.params).toEqual(['c1', 'c2', 'health', 'incident_update', '2026-01-01', '2026-12-31']);
	});
});

describe('hasActiveFilters', () => {
	it('detects any filter', () => {
		expect(hasActiveFilters(q({}))).toBe(false);
		expect(hasActiveFilters(q({ types: ['health'] }))).toBe(true);
		expect(hasActiveFilters(q({ after: '2026-01-01' }))).toBe(true);
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
		expect(search(q({ text: 'zephyr' })).length).toBe(1);
		expect(search(q({ text: 'zephyr' }))[0]).toMatchObject({
			type: 'journal',
			companionName: 'Searchy',
			href: '/c-s/journal/2026-04-01'
		});

		await db
			.update(schema.journalEntries)
			.set({ body: 'flummox walk' })
			.where(eq(schema.journalEntries.id, 'j-s1'));
		expect(search(q({ text: 'zephyr' })).length).toBe(0);
		expect(search(q({ text: 'flummox' })).length).toBe(1);

		await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, 'j-s1'));
		expect(search(q({ text: 'flummox' })).length).toBe(0);
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

		expect(search(q({ text: 'xylograph' }))[0]?.type).toBe('health');
		expect(search(q({ text: 'quibble' }))[0]?.type).toBe('reminder');
		expect(search(q({ text: 'gargoyle' }))[0]?.type).toBe('daily');
		expect(search(q({ text: 'plimsoll' }))[0]?.type).toBe('weight');
		// health event_date derived from occurredAt
		expect(search(q({ text: 'xylograph' }))[0]?.date).toBe('2026-04-02');
		// deep-link hrefs
		expect(search(q({ text: 'xylograph' }))[0]?.href).toBe('/c-s/health?detailHealth=h-s1');
		expect(search(q({ text: 'quibble' }))[0]?.href).toBe('/c-s/reminders?detail=r-s1');
		expect(search(q({ text: 'gargoyle' }))[0]?.href).toBe('/c-s/journal/2026-04-04');
		expect(search(q({ text: 'plimsoll' }))[0]?.href).toBe('/c-s/health?detailWeight=w-s1');
	});

	it('snippet carries sentinel markers around the match', () => {
		const r = search(q({ text: 'gargoyle' }))[0];
		expect(r.snippet).toContain('\x01gargoyle\x02');
	});

	it('indexes journal media captions', async () => {
		await db.insert(schema.journalEntries).values({
			id: 'j-s-media',
			companionId: 'c-s',
			date: '2026-04-09',
			body: 'ordinary entry',
			loggedBy: 'u-s'
		} as typeof schema.journalEntries.$inferInsert);
		await db.insert(schema.media).values({
			id: 'p-s1',
			entryId: 'j-s-media',
			filename: 'sphinx.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 12345,
			caption: 'sphinx caption here'
		} as typeof schema.media.$inferInsert);

		expect(search(q({ text: 'sphinx' })).length).toBe(1);
		expect(search(q({ text: 'sphinx' }))[0]).toMatchObject({
			type: 'media',
			href: '/c-s/journal/2026-04-09?media=p-s1'
		});

		// update: old term gone, new term found
		await db
			.update(schema.media)
			.set({ caption: 'marmot updated' })
			.where(eq(schema.media.id, 'p-s1'));
		expect(search(q({ text: 'sphinx' })).length).toBe(0);
		expect(search(q({ text: 'marmot' })).length).toBe(1);
		expect(search(q({ text: 'marmot' }))[0]?.type).toBe('media');

		// delete: gone
		await db.delete(schema.media).where(eq(schema.media.id, 'p-s1'));
		expect(search(q({ text: 'marmot' })).length).toBe(0);
	});

	it('does not index note media captions', async () => {
		await db.insert(schema.notes).values({ id: 'n-s-media', companionId: 'c-s', title: 'plain' });
		await db.insert(schema.media).values({
			id: 'nm-s1',
			noteId: 'n-s-media',
			filename: 'quokka.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 1,
			caption: 'quokka caption'
		});
		expect(search(q({ text: 'quokka' })).length).toBe(0);
		await db
			.update(schema.media)
			.set({ caption: 'quokka again' })
			.where(eq(schema.media.id, 'nm-s1'));
		expect(search(q({ text: 'quokka' })).length).toBe(0);
	});

	it('drops the search row when media moves off a journal entry', async () => {
		await db.insert(schema.journalEntries).values({
			id: 'j-s-move',
			companionId: 'c-s',
			date: '2026-04-10',
			body: '',
			loggedBy: 'u-s'
		} as typeof schema.journalEntries.$inferInsert);
		await db.insert(schema.notes).values({ id: 'n-s-move', companionId: 'c-s', title: 'plain' });
		await db.insert(schema.media).values({
			id: 'p-s-move',
			entryId: 'j-s-move',
			filename: 'axolotl.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 1,
			caption: 'axolotl'
		});
		expect(search(q({ text: 'axolotl' })).length).toBe(1);
		await db
			.update(schema.media)
			.set({ entryId: null, noteId: 'n-s-move' })
			.where(eq(schema.media.id, 'p-s-move'));
		expect(search(q({ text: 'axolotl' })).length).toBe(0);
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
		const results = search(q({ text: 'brontide' }));
		expect(results[0].id).toBe('j-s2');
	});

	describe('search filters', () => {
		it('text + type filter narrows to that type', () => {
			expect(search(q({ text: 'xylograph' })).some((r) => r.type === 'health')).toBe(true);
			expect(search(q({ text: 'xylograph', types: ['journal'] }))).toHaveLength(0);
		});
		it('filter-only browse returns that type, no text', () => {
			const health = search(q({ types: ['health'] }));
			expect(health.length).toBeGreaterThan(0);
			expect(health.every((r) => r.type === 'health')).toBe(true);
		});
		it('companion filter restricts', () => {
			const mine = search(q({ companionIds: ['c-s'], types: ['health'] }));
			expect(mine.every((r) => r.companionId === 'c-s')).toBe(true);
			expect(search(q({ companionIds: ['nope'], types: ['health'] }))).toHaveLength(0);
		});
		it('date range bounds are inclusive', () => {
			expect(
				search(q({ types: ['health'], after: '2026-04-02', before: '2026-04-02' })).some(
					(r) => r.date === '2026-04-02'
				)
			).toBe(true);
			expect(
				search(q({ types: ['health'], after: '2026-04-03' })).some((r) => r.date === '2026-04-02')
			).toBe(false);
		});
		it('empty everything returns nothing', () => {
			expect(search(q({}))).toEqual([]);
		});
	});
});

describe('note search', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values({ id: 'c-search-note', name: 'Nora' });
		await db.insert(schema.notes).values({
			id: 'n-search',
			companionId: 'c-search-note',
			title: 'Favorite things',
			body: 'Loves sardines'
		});
		await db.insert(schema.noteTags).values({ noteId: 'n-search', tag: 'treats' });
	});

	it('finds a note by body or tag and links to the note page', () => {
		for (const text of ['sardines', 'treats']) {
			const hit = search(q({ text })).find((r) => r.id === 'n-search');
			expect(hit).toMatchObject({ type: 'note', href: '/c-search-note/notes/n-search' });
		}
	});

	it('filters to notes with the note type', () => {
		const results = search(q({ text: 'sardines', types: ['note'] }));
		expect(results.map((r) => r.type)).toEqual(['note']);
	});
});

describe('incident update search', () => {
	beforeAll(async () => {
		await db.insert(schema.healthEvents).values({
			id: 'h-inc',
			companionId: 'c-s',
			title: 'limping incident',
			type: 'incident',
			occurredAt: new Date('2026-05-01T10:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.healthEvents.$inferInsert);
		await db.insert(schema.healthEventUpdates).values({
			id: 'hu-1',
			healthEventId: 'h-inc',
			body: 'gnarlwort poultice applied',
			occurredAt: new Date('2026-05-02T10:00:00Z'),
			loggedBy: 'u-s'
		} as typeof schema.healthEventUpdates.$inferInsert);
		await db.insert(schema.journalEntries).values({
			id: 'j-inc',
			companionId: 'c-s',
			date: '2026-05-03',
			body: 'gnarlwort again in the journal',
			loggedBy: 'u-s'
		} as typeof schema.journalEntries.$inferInsert);
	});

	it('a word only in an update body returns one health result with the incidentUpdate href', () => {
		const results = search(q({ text: 'poultice' }));
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			type: 'health',
			id: 'hu-1',
			href: '/c-s/health?incidentUpdate=hu-1'
		});
	});

	it('health type filter includes update hits', () => {
		const results = search(q({ text: 'poultice', types: ['health'] }));
		expect(results.map((r) => r.id)).toEqual(['hu-1']);
		expect(search(q({ text: 'poultice', types: ['journal'] }))).toEqual([]);
	});

	it('a query matching both an update and a journal entry returns both', () => {
		const results = search(q({ text: 'gnarlwort' }));
		expect(results.map((r) => r.id).sort()).toEqual(['hu-1', 'j-inc']);
	});
});

describe('medication search', () => {
	const C = 'c-s-med';
	beforeAll(async () => {
		await db.insert(schema.companions).values({
			id: C,
			name: 'Pillbox'
		} as typeof schema.companions.$inferInsert);
	});

	function rowid(id: string) {
		return (
			db.$client
				.prepare(
					"SELECT rowid FROM search_index WHERE entity_type = 'medication' AND entity_id = ?"
				)
				.all(id) as { rowid: number }[]
		).map((r) => r.rowid);
	}

	it('indexes inserts, reindexes updates, and drops deletes', async () => {
		await db.insert(schema.medications).values({
			id: 'm-s1',
			companionId: C,
			name: 'Vorbitrex',
			dose: '5 mg',
			instructions: 'with breakfast',
			startedOn: '2026-03-01'
		});
		expect(search(q({ text: 'vorbitrex' }))).toEqual([
			{
				type: 'medication',
				id: 'm-s1',
				companionId: C,
				companionName: 'Pillbox',
				title: 'Vorbitrex',
				snippet: '5 mg with breakfast',
				date: '2026-03-01',
				href: `/${C}/medications/m-s1`
			}
		]);
		expect(search(q({ text: 'breakfast' }))[0]?.id).toBe('m-s1');

		await db
			.update(schema.medications)
			.set({ name: 'Quellmax', dose: null, instructions: 'at bedtime', startedOn: '2026-03-05' })
			.where(eq(schema.medications.id, 'm-s1'));
		expect(search(q({ text: 'vorbitrex' }))).toEqual([]);
		expect(search(q({ text: 'breakfast' }))).toEqual([]);
		expect(search(q({ text: 'quellmax' }))[0]).toMatchObject({
			id: 'm-s1',
			snippet: 'at bedtime',
			date: '2026-03-05'
		});

		// Columns outside the index leave its row alone.
		const before = rowid('m-s1');
		await db
			.update(schema.medications)
			.set({ endedOn: '2026-04-01', doseUnits: 2 })
			.where(eq(schema.medications.id, 'm-s1'));
		expect(rowid('m-s1')).toEqual(before);

		await db.delete(schema.medications).where(eq(schema.medications.id, 'm-s1'));
		expect(search(q({ text: 'quellmax' }))).toEqual([]);
		expect(rowid('m-s1')).toEqual([]);
	});

	it('filters to medications with the medication type', async () => {
		await db.insert(schema.medications).values({
			id: 'm-s2',
			companionId: C,
			name: 'Dravolin',
			startedOn: '2026-03-02'
		});
		await db.insert(schema.journalEntries).values({
			id: 'j-s-med',
			companionId: C,
			date: '2026-03-02',
			body: 'dravolin went down easily',
			loggedBy: 'u-s'
		} as typeof schema.journalEntries.$inferInsert);
		expect(
			search(q({ text: 'dravolin' }))
				.map((r) => r.type)
				.sort()
		).toEqual(['journal', 'medication']);
		expect(search(q({ text: 'dravolin', types: ['medication'] })).map((r) => r.id)).toEqual([
			'm-s2'
		]);
	});
});

describe('supply search', () => {
	// Names sort Alpha before Bravo, so Alpha's row is the one shown when both are active.
	const A = 'c-s-sup-a';
	const B = 'c-s-sup-b';
	const supplyInput = (p: Partial<SupplyInput> = {}): SupplyInput => ({
		name: 'Glimmerkibble',
		kind: 'counted',
		unit: 'cups',
		startingQuantity: null,
		firstPurchaseDate: null,
		lastsDays: null,
		expiresOn: null,
		alertsEnabled: true,
		runOutLeadDays: '7',
		expiryLeadDays: '14',
		lowStockAt: null,
		notes: 'grain free bag',
		...p
	});

	beforeAll(async () => {
		await db.insert(schema.companions).values([
			{ id: A, name: 'Alpha' },
			{ id: B, name: 'Bravo' }
		] as (typeof schema.companions.$inferInsert)[]);
	});

	function rows(id: string) {
		return db.$client
			.prepare(
				"SELECT rowid, companion_id AS companionId, title FROM search_index WHERE entity_type = 'supply' AND entity_id = ? ORDER BY companion_id"
			)
			.all(id) as { rowid: number; companionId: string; title: string }[];
	}

	it('indexes a new supply once per linked pet, follows renames, link changes and deletes', async () => {
		const id = await createSupply(supplyInput(), [A], 'u-s');
		expect(rows(id).map((r) => r.companionId)).toEqual([A]);
		expect(search(q({ text: 'glimmerkibble' }))).toEqual([
			{
				type: 'supply',
				id,
				companionId: A,
				companionName: 'Alpha',
				title: 'Glimmerkibble',
				snippet: 'grain free bag',
				date: localDateISO(),
				href: `/${A}/supplies/${id}`
			}
		]);
		expect(search(q({ text: 'grain' }))[0]?.id).toBe(id);

		// Rename and add a pet in one edit.
		await updateSupply(id, supplyInput({ name: 'Shimmerkibble', notes: null }), [A, B]);
		expect(search(q({ text: 'glimmerkibble' }))).toEqual([]);
		expect(search(q({ text: 'grain' }))).toEqual([]);
		expect(rows(id)).toMatchObject([
			{ companionId: A, title: 'Shimmerkibble' },
			{ companionId: B, title: 'Shimmerkibble' }
		]);

		// Stock changes leave the index alone.
		const before = rows(id).map((r) => r.rowid);
		await db
			.update(schema.supplies)
			.set({ quantity: 12, stockVersion: 'v2' })
			.where(eq(schema.supplies.id, id));
		expect(rows(id).map((r) => r.rowid)).toEqual(before);

		// Taking a pet off drops only its row.
		await updateSupply(id, supplyInput({ name: 'Shimmerkibble', notes: null }), [B]);
		expect(rows(id).map((r) => r.companionId)).toEqual([B]);
		await db.delete(schema.supplyCompanions).where(eq(schema.supplyCompanions.supplyId, id));
		expect(rows(id)).toEqual([]);
		await db.insert(schema.supplyCompanions).values({ supplyId: id, companionId: A });
		expect(rows(id).map((r) => r.companionId)).toEqual([A]);

		await deleteSupply(id);
		expect(rows(id)).toEqual([]);
	});

	it('shows a shared supply once, on an active pet, and on the filtered pet', async () => {
		const id = await createSupply(supplyInput({ name: 'Wobblechew', notes: null }), [A, B], 'u-s');
		const ids = (r: SearchResult[]) => r.map((x) => `${x.id}@${x.companionId}`);

		expect(ids(search(q({ text: 'wobblechew' })))).toEqual([`${id}@${A}`]);
		// Filter-only browse dedupes too.
		expect(ids(search(q({ types: ['supply'] })).filter((r) => r.id === id))).toEqual([
			`${id}@${A}`
		]);
		// The @companion filter picks that pet's row, with its link.
		expect(search(q({ text: 'wobblechew', companionIds: [B] }))).toMatchObject([
			{ id, companionId: B, href: `/${B}/supplies/${id}` }
		]);
		expect(ids(search(q({ types: ['supply'], companionIds: [B] })))).toContain(`${id}@${B}`);
		// Two pet filters still show it once.
		expect(ids(search(q({ text: 'wobblechew', companionIds: [A, B] })))).toEqual([`${id}@${A}`]);
		// A pet it is not linked to finds nothing.
		expect(search(q({ text: 'wobblechew', companionIds: ['c-s'] }))).toEqual([]);

		// An archived pet gives way to an active one.
		await db.update(schema.companions).set({ isActive: false }).where(eq(schema.companions.id, A));
		try {
			expect(ids(search(q({ text: 'wobblechew' })))).toEqual([`${id}@${B}`]);
		} finally {
			await db.update(schema.companions).set({ isActive: true }).where(eq(schema.companions.id, A));
		}
		await deleteSupply(id);
	});

	it('deleting a pet drops its medication and supply rows', async () => {
		const C = 'c-s-gone';
		await db.insert(schema.companions).values({
			id: C,
			name: 'Gone'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.medications).values({
			id: 'm-s-gone',
			companionId: C,
			name: 'Fizzlomab',
			startedOn: '2026-03-01'
		});
		const id = await createSupply(supplyInput({ name: 'Fizzlefood' }), [C, B], 'u-s');
		await db.delete(schema.companions).where(eq(schema.companions.id, C));
		const left = db.$client
			.prepare(
				"SELECT entity_id AS id, companion_id AS companionId FROM search_index WHERE entity_id IN ('m-s-gone', ?)"
			)
			.all(id);
		expect(left).toEqual([{ id, companionId: B }]);
		await deleteSupply(id);
	});
});
