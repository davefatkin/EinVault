import { describe, it, expect, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

const C = 'c-msch';
const base = { filename: 'f.jpg', mimeType: 'image/jpeg', sizeBytes: 1 } as const;

// Drizzle may wrap the driver error, so look at the cause as well.
async function expectCheckFailure(p: Promise<unknown>) {
	const err = await p.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).not.toBeNull();
	const e = err as Error;
	expect(`${e.message} ${String(e.cause ?? '')}`).toMatch(/CHECK constraint failed/);
}

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: 'u-msch', username: 'msch', displayName: 'M', role: 'member' });
	await db.insert(schema.companions).values({ id: C, name: 'Ein' });
	await db
		.insert(schema.journalEntries)
		.values({ id: 'e-msch', companionId: C, date: '2026-05-01' });
	await db.insert(schema.notes).values({ id: 'n-msch', companionId: C, title: 'T' });
	await db.insert(schema.healthEvents).values({
		id: 'h-msch',
		companionId: C,
		type: 'vet_visit',
		title: 'Checkup',
		occurredAt: new Date('2026-05-01T10:00:00Z')
	});
});

describe('media table constraints', () => {
	it('rejects a row with no parent or two parents', async () => {
		await expectCheckFailure(db.insert(schema.media).values({ id: 'm-none', ...base }));
		await expectCheckFailure(
			db.insert(schema.media).values({ id: 'm-two', entryId: 'e-msch', noteId: 'n-msch', ...base })
		);
	});

	it('rejects an update that sets a second parent', async () => {
		await db.insert(schema.media).values({ id: 'm-upd', entryId: 'e-msch', ...base });
		await expectCheckFailure(
			db.update(schema.media).set({ noteId: 'n-msch' }).where(eq(schema.media.id, 'm-upd'))
		);
	});

	it('cascades from each parent kind', async () => {
		await db
			.insert(schema.journalEntries)
			.values({ id: 'e-cas', companionId: C, date: '2026-05-02' });
		await db.insert(schema.notes).values({ id: 'n-cas', companionId: C, title: 'X' });
		await db.insert(schema.healthEvents).values({
			id: 'h-cas',
			companionId: C,
			type: 'other',
			title: 'X',
			occurredAt: new Date()
		});
		await db.insert(schema.media).values([
			{ id: 'm-cas-e', entryId: 'e-cas', ...base },
			{ id: 'm-cas-n', noteId: 'n-cas', ...base },
			{ id: 'm-cas-h', healthEventId: 'h-cas', ...base }
		]);
		await db.delete(schema.journalEntries).where(eq(schema.journalEntries.id, 'e-cas'));
		await db.delete(schema.notes).where(eq(schema.notes.id, 'n-cas'));
		await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, 'h-cas'));
		const left = (await db.query.media.findMany({ columns: { id: true } })).map((m) => m.id);
		expect(left).not.toContain('m-cas-e');
		expect(left).not.toContain('m-cas-n');
		expect(left).not.toContain('m-cas-h');
	});

	it('nulls logged_by when the user is deleted', async () => {
		await db
			.insert(schema.users)
			.values({ id: 'u-gone', username: 'gone', displayName: 'G', role: 'member' });
		await db
			.insert(schema.media)
			.values({ id: 'm-by', entryId: 'e-msch', loggedBy: 'u-gone', ...base });
		await db.delete(schema.users).where(eq(schema.users.id, 'u-gone'));
		const row = await db.query.media.findFirst({ where: eq(schema.media.id, 'm-by') });
		expect(row?.loggedBy).toBeNull();
	});
});
