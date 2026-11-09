import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { actions } from './+page.server';

const companionId = 'rl-comp';
const day = (n: number) => new Date(2030, 5, n, 9, 0, 0);

function form(fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

type Action = (e: never) => Promise<unknown>;
async function call(name: 'add' | 'update', fields: Record<string, string>) {
	const event = {
		request: { formData: async () => form(fields) },
		params: { companionId },
		locals: { user: { id: 'rl-user', role: 'member' }, locale: 'en' }
	};
	return (actions[name] as unknown as Action)(event as never) as Promise<{
		status?: number;
		data?: { error?: string };
	}>;
}

const base = (over: Record<string, string> = {}) => ({
	title: 'Flea',
	type: 'medication',
	dueAt: day(20).toISOString(),
	...over
});

async function row(id: string) {
	return (await db.query.reminders.findFirst({ where: eq(schema.reminders.id, id) }))!;
}
async function lastTitled(title: string) {
	const rows = await db.query.reminders.findMany({
		where: eq(schema.reminders.title, title)
	});
	return rows[rows.length - 1];
}

describe('reminders add/update lead times', () => {
	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: 'rl-user',
			username: 'rl-user',
			displayName: 'RL',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db
			.insert(schema.companions)
			.values({ id: companionId, name: 'RL' } as typeof schema.companions.$inferInsert);
	});

	it('add stores canonical leads and arms them now', async () => {
		const before = Date.now();
		await call('add', base({ title: 'add-ok', notifyLeadDays: '2,7' }));
		const r = (await lastTitled('add-ok'))!;
		expect(r.notifyLeadDays).toBe('7,2');
		expect(Math.abs(r.leadArmedAt!.getTime() - before)).toBeLessThan(5000);
	});

	it('add without leads stores null and does not arm', async () => {
		await call('add', base({ title: 'add-none' }));
		const r = (await lastTitled('add-none'))!;
		expect(r.notifyLeadDays).toBeNull();
		expect(r.leadArmedAt).toBeNull();
	});

	it('add rejects a lead as long as the repeat period', async () => {
		const res = await call(
			'add',
			base({
				title: 'add-long',
				notifyLeadDays: '7',
				isRecurring: 'on',
				recurrenceUnit: 'week',
				recurrenceInterval: '1'
			})
		);
		expect(res.status).toBe(400);
		expect(res.data?.error).toBe('Heads-up times must be shorter than the repeat period.');
		expect(await lastTitled('add-long')).toBeUndefined();
	});

	it('add rejects invalid and too many leads', async () => {
		const a = await call('add', base({ title: 'x1', notifyLeadDays: '2,2' }));
		expect(a.data?.error).toBe('Invalid heads-up times.');
		const b = await call('add', base({ title: 'x2', notifyLeadDays: '1,2,3,7' }));
		expect(b.data?.error).toBe('Use at most 3 heads-up times.');
	});

	async function seed(id: string, over: Partial<typeof schema.reminders.$inferInsert> = {}) {
		await db.insert(schema.reminders).values({
			id,
			companionId,
			title: id,
			type: 'other',
			dueAt: day(20),
			notifyLeadDays: '7',
			leadArmedAt: new Date(2030, 0, 1),
			loggedBy: 'rl-user',
			...over
		} as typeof schema.reminders.$inferInsert);
	}
	const upd = (id: string, over: Record<string, string> = {}) =>
		call('update', base({ id, title: id, ...over }));

	it('update without the field leaves leads and arming alone', async () => {
		await seed('u-absent');
		await upd('u-absent', { dueAt: day(20).toISOString() });
		const r = await row('u-absent');
		expect(r.notifyLeadDays).toBe('7');
		expect(r.leadArmedAt).toEqual(new Date(2030, 0, 1));
	});

	it('update without the field keeps leads but re-arms when dueAt moves', async () => {
		await seed('u-absent-due');
		const before = Date.now();
		await upd('u-absent-due', { dueAt: day(25).toISOString() });
		const r = await row('u-absent-due');
		expect(r.notifyLeadDays).toBe('7');
		expect(Math.abs(r.leadArmedAt!.getTime() - before)).toBeLessThan(5000);
	});

	it('update with a changed dueAt re-arms', async () => {
		await seed('u-due');
		const before = Date.now();
		await upd('u-due', { dueAt: day(25).toISOString(), notifyLeadDays: '7' });
		const r = await row('u-due');
		expect(Math.abs(r.leadArmedAt!.getTime() - before)).toBeLessThan(5000);
	});

	it('update with a changed lead list re-arms', async () => {
		await seed('u-list');
		const before = Date.now();
		await upd('u-list', { notifyLeadDays: '2,7' });
		const r = await row('u-list');
		expect(r.notifyLeadDays).toBe('7,2');
		expect(Math.abs(r.leadArmedAt!.getTime() - before)).toBeLessThan(5000);
	});

	it('update re-saving the same minute leaves arming alone', async () => {
		await seed('u-minute', { dueAt: new Date(2030, 5, 20, 9, 0, 30) });
		await upd('u-minute', { dueAt: new Date(2030, 5, 20, 9, 0, 0).toISOString() });
		const r = await row('u-minute');
		expect(r.leadArmedAt).toEqual(new Date(2030, 0, 1));
	});

	it('update with nothing changed leaves arming alone (order-insensitive)', async () => {
		await seed('u-same', { notifyLeadDays: '7,2' });
		await upd('u-same', { notifyLeadDays: '2,7' });
		const r = await row('u-same');
		expect(r.notifyLeadDays).toBe('7,2');
		expect(r.leadArmedAt).toEqual(new Date(2030, 0, 1));
	});

	it('update with an empty field clears leads and arming', async () => {
		await seed('u-clear');
		await upd('u-clear', { notifyLeadDays: '' });
		const r = await row('u-clear');
		expect(r.notifyLeadDays).toBeNull();
		expect(r.leadArmedAt).toBeNull();
	});

	it('update rejects a too-long lead against the new recurrence', async () => {
		await seed('u-bad');
		const res = await upd('u-bad', {
			notifyLeadDays: '7',
			isRecurring: 'on',
			recurrenceUnit: 'week',
			recurrenceInterval: '1'
		});
		expect(res.status).toBe(400);
		expect((await row('u-bad')).notifyLeadDays).toBe('7');
	});
});
