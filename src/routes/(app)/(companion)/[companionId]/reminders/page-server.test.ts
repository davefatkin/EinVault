import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { completeReminder } from '#lib/server/reminders.js';
import { actions } from './+page.server';

const companionId = 'rl-comp';
const day = (n: number) => new Date(2030, 5, n, 9, 0, 0);

function form(fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

type Action = (e: never) => Promise<unknown>;
async function call(name: 'add' | 'update' | 'restore', fields: Record<string, string>) {
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

describe('reminders linked to a medication', () => {
	const other = 'rl-comp-other';
	beforeAll(async () => {
		await db
			.insert(schema.companions)
			.values({ id: other, name: 'Other' } as typeof schema.companions.$inferInsert);
	});
	let k = 0;
	async function med(companion = companionId, endedOn: string | null = null) {
		const id = `rl-med-${++k}`;
		await db.insert(schema.medications).values({
			id,
			companionId: companion,
			name: 'Carprofen',
			startedOn: '2026-01-01',
			endedOn
		});
		return id;
	}

	it('add links the reminder and redirects to the medication', async () => {
		const m = await med();
		await expect(call('add', base({ title: 'med-add', medicationId: m }))).rejects.toMatchObject({
			status: 303,
			location: `/${companionId}/medications/${m}`
		});
		expect((await lastTitled('med-add'))?.medicationId).toBe(m);
	});

	it("add refuses another companion's medication with 404", async () => {
		const m = await med(other);
		const res = await call('add', base({ title: 'med-other', medicationId: m }));
		expect(res.status).toBe(404);
		expect(res.data?.error).toBe('Medication not found.');
		expect(await lastTitled('med-other')).toBeUndefined();
	});

	it('add refuses an ended medication with 400', async () => {
		const m = await med(companionId, '2020-01-01');
		const res = await call('add', base({ title: 'med-ended', medicationId: m }));
		expect(res.status).toBe(400);
		expect(res.data?.error).toBe('This medication has ended.');
		expect(await lastTitled('med-ended')).toBeUndefined();
	});

	it('add with an empty medicationId stores no link', async () => {
		await call('add', base({ title: 'med-none', medicationId: '' }));
		expect((await lastTitled('med-none'))?.medicationId).toBeNull();
	});

	async function linkedSeries(m: string, id: string) {
		await db.insert(schema.reminders).values({
			id,
			companionId,
			title: id,
			type: 'medication',
			dueAt: day(1),
			isRecurring: true,
			recurrenceUnit: 'day',
			recurrenceInterval: 1,
			seriesId: id,
			medicationId: m,
			loggedBy: 'rl-user'
		} as typeof schema.reminders.$inferInsert);
	}
	const dosesFor = (m: string) =>
		db.query.medicationDoses.findMany({ where: eq(schema.medicationDoses.medicationId, m) });

	it("restore removes the restored occurrence's dose and later occurrences' doses", async () => {
		const m = await med();
		await linkedSeries(m, 'rl-series');
		const first = completeReminder(await row('rl-series'), 'rl-user')!;
		const second = completeReminder(await row(first.nextReminderId!), 'rl-user')!;
		await db.insert(schema.medicationDoses).values({
			id: 'rl-manual',
			medicationId: m,
			givenAt: day(1),
			source: 'manual'
		});
		expect(await dosesFor(m)).toHaveLength(3);

		const res = await call('restore', { id: 'rl-series' });
		expect(res).toEqual({ restoreSuccess: true });
		expect((await row('rl-series')).completedAt).toBeNull();
		expect(
			await db.query.reminders.findFirst({ where: eq(schema.reminders.id, second.nextReminderId!) })
		).toBeUndefined();
		expect((await dosesFor(m)).map((d) => d.id)).toEqual(['rl-manual']);
	});

	it('restore is refused when the medication has ended', async () => {
		const m = await med();
		await linkedSeries(m, 'rl-ended');
		completeReminder(await row('rl-ended'), 'rl-user');
		await db
			.update(schema.medications)
			.set({ endedOn: '2020-01-01' })
			.where(eq(schema.medications.id, m));
		const res = await call('restore', { id: 'rl-ended' });
		expect(res.status).toBe(400);
		expect(res.data?.error).toBe('This medication has ended.');
		expect((await row('rl-ended')).completedAt).not.toBeNull();
		expect(await dosesFor(m)).toHaveLength(1);
	});
});
