import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

const C1 = 'c-nm-1';
const U1 = 'u-nm-1';
const N1 = 'n-nm-1';

beforeAll(async () => {
	await db.insert(schema.companions).values({ id: C1, name: 'Rex' });
	await db
		.insert(schema.users)
		.values({ id: U1, username: 'nm1', displayName: 'Jet', role: 'member', passwordHash: 'x' });
});

beforeEach(async () => {
	await db.delete(schema.notes);
	await db.insert(schema.notes).values({ id: N1, companionId: C1, title: 'Commands' });
});

describe('note_media schema', () => {
	it('fills defaults in SQL, including created_at', async () => {
		db.run(
			sql`INSERT INTO note_media (id, note_id, filename, mime_type, size_bytes) VALUES ('m-raw', ${N1}, 'm-raw.jpg', 'image/jpeg', 1)`
		);
		const row = await db.query.noteMedia.findFirst({ where: eq(schema.noteMedia.id, 'm-raw') });
		expect(row).toMatchObject({
			provider: 'local',
			mediaType: 'photo',
			status: 'ready',
			transcodeAttempts: 0,
			caption: null
		});
		expect(row!.createdAt).toBeInstanceOf(Date);
		expect(row!.createdAt.getTime()).toBeGreaterThan(0);
	});

	it('cascades media rows when the note is deleted', async () => {
		await db.insert(schema.noteMedia).values({
			id: 'm-1',
			noteId: N1,
			filename: 'm-1.jpg',
			storageKey: `notes/${C1}/${N1}/m-1.jpg`,
			mimeType: 'image/jpeg',
			sizeBytes: 10,
			loggedBy: U1
		});
		await db.delete(schema.notes).where(eq(schema.notes.id, N1));
		expect(await db.query.noteMedia.findMany()).toEqual([]);
	});

	it('loads the note and logger relations', async () => {
		await db.insert(schema.noteMedia).values({
			id: 'm-2',
			noteId: N1,
			filename: 'm-2.jpg',
			mimeType: 'image/jpeg',
			sizeBytes: 10,
			loggedBy: U1
		});
		const row = await db.query.noteMedia.findFirst({
			where: eq(schema.noteMedia.id, 'm-2'),
			with: { note: { columns: { companionId: true } }, logger: { columns: { displayName: true } } }
		});
		expect(row?.note.companionId).toBe(C1);
		expect(row?.logger?.displayName).toBe('Jet');
	});
});
