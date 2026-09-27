import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { handleMoodTrendDaysUpdate } from './account';

function post(days: string): Request {
	const fd = new FormData();
	fd.set('days', days);
	return new Request('http://localhost/?/setMoodTrendDays', { method: 'POST', body: fd });
}

async function stored(id: string) {
	const row = await db.query.users.findFirst({ where: eq(schema.users.id, id) });
	return row?.moodTrendDays ?? null;
}

describe('handleMoodTrendDaysUpdate', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values([
			{ id: 'u-mt', username: 'mt-member', displayName: 'MT', role: 'member' },
			{ id: 'u-mt-care', username: 'mt-care', displayName: 'MT Care', role: 'caretaker' }
		] as (typeof schema.users.$inferInsert)[]);
	});

	it('saves a valid range', async () => {
		const res = await handleMoodTrendDaysUpdate({ id: 'u-mt', role: 'member' }, post('30'), 'en');
		expect(res).toEqual({ moodTrendSuccess: true });
		expect(await stored('u-mt')).toBe(30);
	});

	it('rejects values outside 7/30/90 with 400 and keeps the stored value', async () => {
		for (const bad of ['14', 'abc', '', '0']) {
			const res = await handleMoodTrendDaysUpdate({ id: 'u-mt', role: 'member' }, post(bad), 'en');
			expect(res).toMatchObject({ status: 400, data: { error: 'Invalid mood range.' } });
		}
		expect(await stored('u-mt')).toBe(30);
	});

	it('returns 403 for caretakers and writes nothing', async () => {
		const res = await handleMoodTrendDaysUpdate(
			{ id: 'u-mt-care', role: 'caretaker' },
			post('90'),
			'en'
		);
		expect(res).toMatchObject({ status: 403 });
		expect(await stored('u-mt-care')).toBeNull();
	});
});
