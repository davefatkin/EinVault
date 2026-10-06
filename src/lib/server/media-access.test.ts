import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { resolveJournalMedia, type MediaViewer } from './media-access';

const C1 = 'c-ma-1';
const C2 = 'c-ma-2';
const ENTRY = 'e-ma-1';
const DATE = '2026-03-04';
const MEMBER: MediaViewer = { id: 'u-ma-mem', role: 'member' };
const ADMIN: MediaViewer = { id: 'u-ma-adm', role: 'admin' };
const CT_ASSIGNED: MediaViewer = { id: 'u-ma-ct1', role: 'caretaker' };
const CT_OTHER: MediaViewer = { id: 'u-ma-ct2', role: 'caretaker' };

async function statusOf(p: Promise<unknown>): Promise<number | 'ok'> {
	try {
		await p;
		return 'ok';
	} catch (e) {
		return (e as { status: number }).status;
	}
}

beforeAll(async () => {
	await db.insert(schema.users).values([
		{ id: MEMBER.id, username: 'ma-mem', displayName: 'M', role: 'member' },
		{ id: ADMIN.id, username: 'ma-adm', displayName: 'A', role: 'admin' },
		{ id: CT_ASSIGNED.id, username: 'ma-ct1', displayName: 'C1', role: 'caretaker' },
		{ id: CT_OTHER.id, username: 'ma-ct2', displayName: 'C2', role: 'caretaker' }
	] as (typeof schema.users.$inferInsert)[]);
	await db.insert(schema.companions).values([
		{ id: C1, name: 'Rex' },
		{ id: C2, name: 'Bo', isActive: false }
	] as (typeof schema.companions.$inferInsert)[]);
	await db
		.insert(schema.companionCaretakers)
		.values([
			{ companionId: C1, userId: CT_ASSIGNED.id }
		] as (typeof schema.companionCaretakers.$inferInsert)[]);
	await db.insert(schema.journalEntries).values({ id: ENTRY, companionId: C1, date: DATE });
	await db.insert(schema.journalPhotos).values([
		{
			id: 'jp-1',
			entryId: ENTRY,
			filename: 'jp-1.jpg',
			provider: 'local',
			storageKey: `journal/${C1}/${DATE}/jp-1.jpg`,
			mimeType: 'image/jpeg',
			sizeBytes: 10
		},
		{
			id: 'jp-legacy',
			entryId: ENTRY,
			filename: 'jp-legacy.jpg',
			provider: 'local',
			storageKey: null,
			mimeType: 'image/jpeg',
			sizeBytes: 10
		},
		{
			id: 'jp-vid',
			entryId: ENTRY,
			filename: 'jp-vid.mp4',
			provider: 's3',
			storageKey: `journal/${C1}/${DATE}/jp-vid.mp4`,
			mediaType: 'video',
			mimeType: 'video/mp4',
			sizeBytes: 10,
			posterKey: `journal/${C1}/${DATE}/jp-vid.poster.jpg`
		}
	] as (typeof schema.journalPhotos.$inferInsert)[]);
});

const seg = (file: string, companionId = C1, date = DATE) => ['journal', companionId, date, file];

describe('resolveJournalMedia', () => {
	it('resolves the stored key and mime type for members and admins', async () => {
		for (const user of [MEMBER, ADMIN]) {
			expect(await resolveJournalMedia(seg('jp-1.jpg'), user, 'en', false)).toEqual({
				provider: 'local',
				key: `journal/${C1}/${DATE}/jp-1.jpg`,
				mimeType: 'image/jpeg',
				isPoster: false
			});
		}
	});

	it('falls back to the URL path when storage_key is null', async () => {
		const r = await resolveJournalMedia(seg('jp-legacy.jpg'), MEMBER, 'en', false);
		expect(r.key).toBe(`journal/${C1}/${DATE}/jp-legacy.jpg`);
	});

	it('serves the poster as image/jpeg when asked', async () => {
		expect(await resolveJournalMedia(seg('jp-vid.mp4'), MEMBER, 'en', true)).toEqual({
			provider: 's3',
			key: `journal/${C1}/${DATE}/jp-vid.poster.jpg`,
			mimeType: 'image/jpeg',
			isPoster: true
		});
	});

	it('404s for a poster request on a row without one', async () => {
		expect(await statusOf(resolveJournalMedia(seg('jp-1.jpg'), MEMBER, 'en', true))).toBe(404);
	});

	it('404s for unknown files, wrong companion, wrong date and bad segment counts', async () => {
		expect(await statusOf(resolveJournalMedia(seg('nope.jpg'), MEMBER, 'en', false))).toBe(404);
		expect(await statusOf(resolveJournalMedia(seg('jp-1.jpg', C2), MEMBER, 'en', false))).toBe(404);
		expect(
			await statusOf(resolveJournalMedia(seg('jp-1.jpg', C1, '2026-03-05'), MEMBER, 'en', false))
		).toBe(404);
		expect(
			await statusOf(resolveJournalMedia(['journal', C1, 'jp-1.jpg'], MEMBER, 'en', false))
		).toBe(404);
	});

	it('lets an assigned caretaker read (no shift or active check) and 403s others', async () => {
		expect(await statusOf(resolveJournalMedia(seg('jp-1.jpg'), CT_ASSIGNED, 'en', false))).toBe(
			'ok'
		);
		expect(await statusOf(resolveJournalMedia(seg('jp-1.jpg'), CT_OTHER, 'en', false))).toBe(403);
	});
});
