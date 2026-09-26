import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { resolveActivityUpdate } from './journal-activity';

const catId = 'ja-cat';
const oldId = 'ja-old-bathroom';
const litterEventId = 'ja-litter';

describe('resolveActivityUpdate', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values({
			id: catId,
			name: 'Whiskers',
			species: 'cat'
		} as typeof schema.companions.$inferInsert);
		await db.insert(schema.dailyEvents).values([
			{
				id: oldId,
				companionId: catId,
				type: 'bathroom',
				notes: null,
				durationMinutes: null,
				subtypes: ['pee'],
				loggedAt: new Date()
			},
			{
				id: litterEventId,
				companionId: catId,
				type: 'litter',
				notes: null,
				durationMinutes: null,
				subtypes: null,
				loggedAt: new Date()
			}
		] as (typeof schema.dailyEvents.$inferInsert)[]);
	});

	it('keeps a now-disallowed type and its subtypes when the type is unchanged', async () => {
		const res = await resolveActivityUpdate(catId, oldId, 'bathroom', ['pee']);
		expect(res).toEqual({ ok: true, subtypes: ['pee'] });
	});
	it('rejects switching to a disallowed type', async () => {
		const res = await resolveActivityUpdate(catId, litterEventId, 'bathroom', []);
		expect(res).toEqual({ ok: false, code: 'typeNotAllowedForSpecies' });
	});
	it('narrows subtypes by species when the type changes', async () => {
		const res = await resolveActivityUpdate(catId, oldId, 'walk', ['leash', 'hike']);
		expect(res).toEqual({ ok: true, subtypes: ['leash'] });
	});
	it("notFound for another companion's event", async () => {
		const res = await resolveActivityUpdate(catId, 'nope', 'meal', []);
		expect(res).toEqual({ ok: false, code: 'notFound' });
	});
});
