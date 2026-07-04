import { describe, it, expect } from 'vitest';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { createHealthEvent } from './health';

describe('createHealthEvent', () => {
	it('inserts a health event and returns its id', async () => {
		const [c] = await db
			.insert(schema.companions)
			.values({ id: 'c-h1', name: 'Rex', species: 'dog' })
			.returning();
		const [u] = await db
			.insert(schema.users)
			.values({
				id: 'u-h1',
				username: 'vet',
				displayName: 'Vet',
				role: 'member',
				passwordHash: 'x'
			})
			.returning();
		const id = await createHealthEvent(
			c.id,
			{
				type: 'vet_visit',
				title: 'Checkup',
				notes: 'all good',
				occurredAt: new Date('2019-01-01'),
				vetName: 'Dr A',
				vetClinic: 'Clinic'
			},
			u.id
		);
		const row = await db.query.healthEvents.findFirst({ where: eq(schema.healthEvents.id, id) });
		expect(row?.companionId).toBe(c.id);
		expect(row?.title).toBe('Checkup');
		expect(row?.occurredAt.getUTCFullYear()).toBe(2019);
		expect(row?.loggedBy).toBe(u.id);
	});
});
