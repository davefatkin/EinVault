import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { load } from './+page.server';

describe('health page load journal dates', () => {
	const companionId = 'hp-links';
	beforeAll(async () => {
		await db
			.insert(schema.companions)
			.values({ id: companionId, name: 'HP' } as typeof schema.companions.$inferInsert);
		await db.insert(schema.healthEvents).values({
			id: 'hp-ev',
			companionId,
			type: 'vet_visit',
			title: 'Visit',
			occurredAt: new Date(2026, 0, 5, 12)
		});
		await db.insert(schema.journalEntries).values({ id: 'hp-e', companionId, date: '2026-01-09' });
		await db
			.insert(schema.journalEntryHealthEvents)
			.values({ entryId: 'hp-e', healthEventId: 'hp-ev' });
	});

	it('returns the linking days per event', async () => {
		const data = (await load({
			params: { companionId },
			locals: { user: { id: 'u', role: 'member' }, locale: 'en' },
			parent: async () => ({ companion: { id: companionId } })
		} as unknown as Parameters<typeof load>[0])) as {
			journalDatesByEvent: Record<string, string[]>;
		};
		expect(data.journalDatesByEvent).toEqual({ 'hp-ev': ['2026-01-09'] });
	});
});
