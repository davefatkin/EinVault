import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, schema } from '$server/db';
import { seedRows, SEED } from '$server/db/demo-seed';

// copyDemoPhotoFiles does rmSync on the real uploads dir, which would destroy
// a developer's journal photos in the ./data directory. Stub the fs operations
// it relies on so tests only exercise DB state.
vi.mock('node:fs', async (importOriginal) => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return {
		...actual,
		rmSync: vi.fn(),
		copyFileSync: vi.fn(),
		mkdirSync: vi.fn()
	};
});

describe('seedRows', () => {
	beforeEach(async () => {
		// Each test needs a clean slate. The test DB is shared within this file,
		// so clear seeded tables before each test (cascade deletes handle children).
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
	});

	it('populates the Bebop dataset including an active caretaker shift', async () => {
		seedRows(db as never, { now: 1_700_000_000_000 });
		const users = await db.query.users.findMany();
		const usernames = users.map((u) => u.username).sort();
		expect(usernames).toContain(SEED.admin.username); // spike
		expect(usernames).toContain(SEED.member.username); // jet
		expect(usernames).toContain(SEED.caretaker.username); // faye
		const shifts = await db.query.caretakerShifts.findMany();
		expect(shifts.some((s) => s.id === 'seed-shift-active')).toBe(true);
	});

	it('seeds a rich dataset: photos, varied moods, weight trend, mixed reminders', async () => {
		seedRows(db as never, { now: 1_700_000_000_000 });
		const photos = await db.query.journalPhotos.findMany();
		expect(photos.length).toBeGreaterThanOrEqual(5);

		const entries = await db.query.journalEntries.findMany();
		const moods = new Set(entries.map((e) => e.mood).filter(Boolean));
		expect(moods.size).toBeGreaterThanOrEqual(4); // great/good/meh/off/sick variety

		const weights = await db.query.weightEntries.findMany();
		expect(weights.length).toBeGreaterThanOrEqual(8); // multi-point trend for charts

		const reminders = await db.query.reminders.findMany();
		expect(reminders.some((r) => r.completedAt != null)).toBe(true); // completed
		expect(
			reminders.some((r) => r.completedAt == null && r.dueAt.getTime() < 1_700_000_000_000)
		).toBe(true); // overdue
		expect(reminders.some((r) => r.isRecurring)).toBe(true); // recurring

		const events = await db.query.dailyEvents.findMany();
		expect(new Set(events.map((e) => e.type)).size).toBeGreaterThanOrEqual(4);
	});

	it('photo storageKeys contain the date of their linked journal entry', async () => {
		const now = 1_700_000_000_000;
		seedRows(db as never, { now });

		const photos = await db.query.journalPhotos.findMany();
		const entries = await db.query.journalEntries.findMany();
		const entryById = new Map(entries.map((e) => [e.id, e]));

		for (const photo of photos) {
			const entry = entryById.get(photo.entryId);
			expect(
				entry,
				`no journal entry found for photo ${photo.id} (entryId=${photo.entryId})`
			).toBeDefined();
			expect(
				photo.storageKey,
				`storageKey for photo ${photo.id} must contain its entry's date (${entry!.date})`
			).toContain(entry!.date);
		}
	});
});

describe('ensureDemoUsers', () => {
	beforeEach(async () => {
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
	});

	it('inserts four demo users on first call', async () => {
		const { ensureDemoUsers } = await import('$server/db/demo-seed');
		const inserted = await ensureDemoUsers(db);
		expect(inserted).toBe(4);
		const users = await db.query.users.findMany();
		expect(users.map((u) => u.id)).toContain(SEED.admin.id);
	});

	it('is idempotent — second call inserts 0', async () => {
		const { ensureDemoUsers } = await import('$server/db/demo-seed');
		await ensureDemoUsers(db);
		const inserted = await ensureDemoUsers(db);
		expect(inserted).toBe(0);
	});
});

describe('refreshDemoContent', () => {
	// node:fs is mocked at the top of this file, so the dataDir arg is never
	// written to; any path is safe.
	const DATA_DIR = '/tmp/einvault-demo-test';

	beforeEach(async () => {
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
	});

	it('refuses to run when demoMode is false (fail closed)', async () => {
		const { refreshDemoContent } = await import('$server/db/demo-seed');
		expect(() => refreshDemoContent(db, false, DATA_DIR)).toThrow(/DEMO_MODE/);
	});

	it('re-seeds content anchored to now after wiping old rows', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('$server/db/demo-seed');
		// Seed users first (refreshDemoContent only touches content, not users)
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);

		const entries = await db.query.journalEntries.findMany();
		expect(entries.length).toBeGreaterThan(0);

		// All journal entries should have dates within the last 60 days
		const now = Date.now();
		const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;
		for (const entry of entries) {
			const entryMs = new Date(entry.date).getTime();
			expect(entryMs).toBeGreaterThan(sixtyDaysAgo);
		}
	});

	it('is idempotent — calling twice leaves one set of content rows', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('$server/db/demo-seed');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);
		refreshDemoContent(db, true, DATA_DIR);

		const companions = await db.query.companions.findMany();
		expect(companions.length).toBe(2); // only Ein and Edward, not doubled
	});
});

describe('startDemoRefreshScheduler', () => {
	it('can be called multiple times without throwing', async () => {
		// Just verify idempotency — don't wait for the 24h timer to fire
		const { startDemoRefreshScheduler } = await import('$server/db/demo-seed');
		expect(() => {
			startDemoRefreshScheduler(db, true, '/tmp/einvault-demo-test');
			startDemoRefreshScheduler(db, true, '/tmp/einvault-demo-test'); // second call is no-op
		}).not.toThrow();
	});
});
