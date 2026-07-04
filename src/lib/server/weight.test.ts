import { describe, it, expect } from 'vitest';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createWeightEntry } from './weight';

describe('createWeightEntry', () => {
	it('inserts a weight entry and returns its id', async () => {
		const [c] = await db
			.insert(schema.companions)
			.values({ id: 'c-w1', name: 'Rex', species: 'dog' })
			.returning();
		const id = await createWeightEntry(
			c.id,
			{ weight: 12.5, unit: 'kg', notes: null, recordedAt: new Date('2020-06-01') },
			null
		);
		const row = await db.query.weightEntries.findFirst({ where: eq(schema.weightEntries.id, id) });
		expect(row?.weight).toBe(12.5);
		expect(row?.unit).toBe('kg');
	});
});
