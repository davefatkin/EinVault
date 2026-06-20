import { describe, it, expect, beforeEach } from 'vitest';
import { db, schema } from '$server/db';
import { seedRows, SEED } from '$server/db/demo-seed';

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
});
