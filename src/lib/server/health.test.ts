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

describe('createHealthEvent and medication reminders', () => {
	it('a medication health event is not a dose: no pill taken, reminder left open', async () => {
		await db.insert(schema.companions).values({ id: 'c-h2', name: 'Pip', species: 'dog' });
		await db.insert(schema.reminders).values({
			id: 'r-h2',
			companionId: 'c-h2',
			title: 'Carprofen',
			type: 'medication',
			dueAt: new Date(Date.now() - 60_000),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			seriesId: 'r-h2',
			pillsLeft: 5
		});

		await createHealthEvent(
			'c-h2',
			{
				type: 'medication',
				title: 'Carprofen',
				notes: null,
				occurredAt: new Date(),
				vetName: null,
				vetClinic: null
			},
			null
		);

		const rows = await db.query.reminders.findMany({
			where: eq(schema.reminders.companionId, 'c-h2')
		});
		expect(rows).toHaveLength(1);
		expect(rows[0].completedAt).toBeNull();
		expect(rows[0].outcome).toBeNull();
		expect(rows[0].pillsLeft).toBe(5);
	});
});
