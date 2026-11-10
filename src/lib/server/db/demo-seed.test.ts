import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isNotNull } from 'drizzle-orm';
import { copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { db, schema } from '#lib/server/db/index.js';
import { currentSeverity } from '#lib/incidents.js';
import {
	seedRows,
	seedDemoIncidents,
	seedDemoReminderHeadsUps,
	SEED,
	copyDemoPhotoFiles
} from '#lib/server/db/demo-seed.js';

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
	it('seeds no medications and leaves medication_schedule null', async () => {
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
		seedRows(db as never, { now: 1_700_000_000_000 });
		expect(await db.select().from(schema.medications)).toEqual([]);
		expect(await db.select().from(schema.medicationDoses)).toEqual([]);
		const comps = await db.query.companions.findMany();
		expect(comps.length).toBeGreaterThan(0);
		expect(comps.every((c) => c.medicationSchedule === null)).toBe(true);
		const linked = await db.query.reminders.findMany({
			where: (r, { isNotNull }) => isNotNull(r.medicationId)
		});
		expect(linked).toEqual([]);
	});

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
		const photos = await db.query.media.findMany({ where: isNotNull(schema.media.entryId) });
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

	it('seeds daily events with subtypes for the demo', async () => {
		seedRows(db as never, { now: 1_700_000_000_000 });
		const events = await db.query.dailyEvents.findMany();
		expect(events.some((e) => e.subtypes?.includes('poop'))).toBe(true);
		expect(events.some((e) => e.subtypes?.includes('bath') && e.subtypes?.includes('brush'))).toBe(
			true
		);
		const qls = await db.query.quickLogs.findMany();
		expect(qls.some((q) => q.subtypes?.includes('pee'))).toBe(true);
	});

	it('photo storageKeys contain the date of their linked journal entry', async () => {
		const now = 1_700_000_000_000;
		seedRows(db as never, { now });

		const photos = await db.query.media.findMany({ where: isNotNull(schema.media.entryId) });
		const entries = await db.query.journalEntries.findMany();
		const entryById = new Map(entries.map((e) => [e.id, e]));

		for (const photo of photos) {
			const entry = entryById.get(photo.entryId!);
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

	it('seeds shared, private, pinned, and tagged notes', async () => {
		seedRows(db as never, { now: 1_700_000_000_000 });
		const notes = await db.query.notes.findMany({ with: { tags: true } });
		const byId = new Map(notes.map((n) => [n.id, n]));
		expect(byId.get(SEED.notes.einSitter.id)?.sharedWithCaretakers).toBe(true);
		expect(byId.get(SEED.notes.einPrivate.id)?.sharedWithCaretakers).toBe(false);
		expect(notes.some((n) => n.pinned)).toBe(true);
		expect(byId.get(SEED.notes.einCommands.id)?.tags.map((t) => t.tag)).toEqual(
			expect.arrayContaining(['training'])
		);
		const companions = await db.query.companions.findMany();
		expect(companions.every((c) => c.notesForSitter === null)).toBe(true);
	});

	it('seeds note media on shared, private, and unassigned-companion notes (#321)', async () => {
		seedRows(db as never, { now: 1_700_000_000_000 });
		const rows = await db.query.media.findMany({ where: isNotNull(schema.media.noteId) });
		const byId = new Map(rows.map((r) => [r.id, r]));
		for (const m of Object.values(SEED.noteMedia)) {
			const row = byId.get(m.id);
			expect(row, m.id).toBeDefined();
			expect(row!.noteId).toBe(m.noteId);
			expect(row!.filename).toBe(m.filename);
			expect(row!.provider).toBe('local');
			expect(row!.mediaType).toBe('photo');
			expect(row!.status).toBe('ready');
			expect(row!.caption).toBe(m.caption);
			expect(row!.storageKey).toBe(`notes/${m.companionId}/${m.noteId}/${m.filename}`);
		}
		// The serving lookup matches on noteId + filename; keep filenames unique anyway.
		expect(new Set(rows.map((r) => r.filename)).size).toBe(rows.length);
	});
});

describe('copyDemoPhotoFiles', () => {
	it('copies each note media asset to its storage key (#321)', () => {
		vi.mocked(copyFileSync).mockClear();
		const root = join('/tmp', 'einvault-demo-seed-test', 'uploads');
		copyDemoPhotoFiles(root, 1_700_000_000_000);
		const calls = vi
			.mocked(copyFileSync)
			.mock.calls.map(([src, dest]) => [String(src), String(dest)]);
		for (const m of Object.values(SEED.noteMedia)) {
			const dest = join(root, 'notes', m.companionId, m.noteId, m.filename);
			const call = calls.find(([, d]) => d === dest);
			expect(call, dest).toBeDefined();
			expect(call![0].endsWith(m.sourceAsset)).toBe(true);
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
		const { ensureDemoUsers } = await import('#lib/server/db/demo-seed.js');
		const inserted = await ensureDemoUsers(db);
		expect(inserted).toBe(4);
		const users = await db.query.users.findMany();
		expect(users.map((u) => u.id)).toContain(SEED.admin.id);
	});

	it('is idempotent — second call inserts 0', async () => {
		const { ensureDemoUsers } = await import('#lib/server/db/demo-seed.js');
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

	it('seeds the demo medications with a linked daily reminder and past doses', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);
		refreshDemoContent(db, true, DATA_DIR);
		const meds = await db.select().from(schema.medications);
		const byName = new Map(meds.map((m) => [m.name, m]));
		expect(meds).toHaveLength(4);
		const carprofen = byName.get('Carprofen')!;
		expect(carprofen).toMatchObject({
			companionId: SEED.companions.ein.id,
			dose: '1 tablet',
			instructions: 'With food.'
		});
		expect(carprofen.endedOn).toBeTruthy();
		const heartworm = byName.get('Heartworm chew')!;
		expect(heartworm.companionId).toBe(SEED.companions.ein.id);
		const recurring = await db.query.reminders.findFirst({
			where: (r, { eq }) => eq(r.id, 'seed-reminder-recurring')
		});
		expect(recurring?.medicationId).toBe(heartworm.id);
		const open = await db.query.reminders.findMany({
			where: (r, { and, eq, isNull }) =>
				and(eq(r.medicationId, carprofen.id), isNull(r.completedAt))
		});
		expect(open).toHaveLength(1);
		expect(open[0]).toMatchObject({ recurrenceUnit: 'day', recurrenceInterval: 1 });
		expect(open[0].dueAt.getHours()).toBe(8);
		const companions = new Set(meds.map((m) => m.companionId));
		expect(companions).toEqual(
			new Set([SEED.companions.ein.id, SEED.companions.edward.id, SEED.companions.julia.id])
		);
		const doses = await db.select().from(schema.medicationDoses);
		expect(doses.length).toBeGreaterThanOrEqual(3);
		expect(new Set(doses.map((d) => d.source))).toEqual(new Set(['manual', 'reminder']));
	});

	it('refuses to run when demoMode is false (fail closed)', async () => {
		const { refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		expect(() => refreshDemoContent(db, false, DATA_DIR)).toThrow(/DEMO_MODE/);
	});

	it('leaves exactly one seed worth of media after a second refresh', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);
		const first = await db.query.media.findMany({ columns: { id: true } });
		refreshDemoContent(db, true, DATA_DIR);
		const second = await db.query.media.findMany({ columns: { id: true } });
		expect(first.length).toBeGreaterThan(0);
		expect(second.length).toBe(first.length);
	});

	it('seeds one journal-to-health-event link, once', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);
		refreshDemoContent(db, true, DATA_DIR);
		const links = await db.select().from(schema.journalEntryHealthEvents);
		expect(links).toEqual([
			expect.objectContaining({ entryId: 'seed-journal-ein-d1', healthEventId: 'seed-health-1' })
		]);
	});

	it('re-seeds content anchored to now after wiping old rows', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
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
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, DATA_DIR);
		refreshDemoContent(db, true, DATA_DIR);

		const companions = await db.query.companions.findMany();
		expect(companions.length).toBe(3); // only Ein, Edward and Julia, not doubled
	});
});

describe('startDemoRefreshScheduler', () => {
	it('can be called multiple times without throwing', async () => {
		// Just verify idempotency — don't wait for the 24h timer to fire
		const { startDemoRefreshScheduler } = await import('#lib/server/db/demo-seed.js');
		expect(() => {
			startDemoRefreshScheduler(db, true, '/tmp/einvault-demo-test');
			startDemoRefreshScheduler(db, true, '/tmp/einvault-demo-test'); // second call is no-op
		}).not.toThrow();
	});
});

describe('seedDemoIncidents', () => {
	const now = 1_700_000_000_000;

	beforeEach(async () => {
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
	});

	const incidents = () =>
		db.query.healthEvents.findMany({ where: (h, { eq }) => eq(h.type, 'incident') });

	it('seedRows alone creates no incidents (keeps e2e free of banners)', async () => {
		seedRows(db as never, { now });
		expect(await incidents()).toEqual([]);
		expect(await db.select().from(schema.healthEventUpdates)).toEqual([]);
		expect(await db.select().from(schema.healthEventLinks)).toEqual([]);
	});

	it('adds one open incident for Ein and one resolved incident', async () => {
		seedRows(db as never, { now });
		seedDemoIncidents(db as never, { now });
		const all = await incidents();
		const open = all.filter((i) => !i.resolvedAt);
		const resolved = all.filter((i) => i.resolvedAt);
		expect(open.map((i) => i.id)).toEqual([SEED.incidents.einLimp.id]);
		expect(open[0].companionId).toBe(SEED.companions.ein.id);
		expect(resolved.map((i) => i.id)).toEqual([SEED.incidents.edwardStomach.id]);
	});

	it('orders updates by severity and ends Ein at mild', async () => {
		seedRows(db as never, { now });
		seedDemoIncidents(db as never, { now });
		const incident = await db.query.healthEvents.findFirst({
			where: (h, { eq }) => eq(h.id, SEED.incidents.einLimp.id)
		});
		const updates = await db.query.healthEventUpdates.findMany({
			where: (u, { eq }) => eq(u.healthEventId, SEED.incidents.einLimp.id),
			orderBy: (u, { asc }) => asc(u.occurredAt)
		});
		expect(updates.map((u) => u.severity)).toEqual(['moderate', 'mild', 'mild']);
		expect(currentSeverity(incident!, updates)).toBe('mild');
		const stomach = await db.query.healthEventUpdates.findMany({
			where: (u, { eq }) => eq(u.healthEventId, SEED.incidents.edwardStomach.id)
		});
		expect(stomach).toHaveLength(2);
	});

	it('keeps the story dates and authors consistent', async () => {
		seedRows(db as never, { now });
		seedDemoIncidents(db as never, { now });
		const events = await db.query.healthEvents.findMany();
		const byId = new Map(events.map((e) => [e.id, e]));
		const updates = await db.query.healthEventUpdates.findMany({
			orderBy: (u, { asc }) => asc(u.occurredAt)
		});
		const userIds = new Set((await db.query.users.findMany()).map((u) => u.id));
		for (const u of updates) {
			expect(u.occurredAt.getTime()).toBeGreaterThan(
				byId.get(u.healthEventId)!.occurredAt.getTime()
			);
			expect(userIds.has(u.loggedBy!)).toBe(true);
		}
		for (const i of events.filter((e) => e.type === 'incident')) {
			expect(userIds.has(i.loggedBy!)).toBe(true);
		}
		const stomach = byId.get(SEED.incidents.edwardStomach.id)!;
		const stomachUps = updates.filter((u) => u.healthEventId === stomach.id);
		expect(stomach.resolvedAt!.getTime()).toBeGreaterThan(stomach.occurredAt.getTime());
		for (const u of stomachUps) {
			expect(u.occurredAt.getTime()).toBeLessThanOrEqual(stomach.resolvedAt!.getTime());
		}
		expect(stomachUps.at(-1)!.occurredAt.getTime()).toBeLessThanOrEqual(
			stomach.resolvedAt!.getTime()
		);
		const [u1, u2] = updates.filter((u) => u.healthEventId === SEED.incidents.einLimp.id);
		const visit = byId.get(SEED.incidents.einLimp.recheckId)!;
		expect(visit.occurredAt.getTime()).toBeGreaterThan(u1.occurredAt.getTime());
		expect(visit.occurredAt.getTime()).toBeLessThan(u2.occurredAt.getTime());
	});

	it('links Ein incident to a vet visit', async () => {
		seedRows(db as never, { now });
		seedDemoIncidents(db as never, { now });
		const links = await db.select().from(schema.healthEventLinks);
		expect(links).toHaveLength(1);
		const visit = await db.query.healthEvents.findFirst({
			where: (h, { eq }) => eq(h.id, links[0].healthEventId)
		});
		expect(links[0].incidentId).toBe(SEED.incidents.einLimp.id);
		expect(visit?.type).toBe('vet_visit');
	});

	it('refreshDemoContent seeds them too', async () => {
		const { ensureDemoUsers, refreshDemoContent } = await import('#lib/server/db/demo-seed.js');
		await ensureDemoUsers(db);
		refreshDemoContent(db, true, '/tmp/einvault-demo-test');
		refreshDemoContent(db, true, '/tmp/einvault-demo-test');
		expect(await incidents()).toHaveLength(2);
		expect(await db.select().from(schema.healthEventUpdates)).toHaveLength(5);
		expect(await db.select().from(schema.healthEventLinks)).toHaveLength(1);
	});
});

describe('seedDemoReminderHeadsUps', () => {
	const now = 1_700_000_000_000;

	beforeEach(async () => {
		await db.delete(schema.caretakerShifts);
		await db.delete(schema.companionCaretakers);
		await db.delete(schema.companions);
		await db.delete(schema.users);
	});

	const withLeads = async () =>
		(await db.query.reminders.findMany()).filter((r) => r.notifyLeadDays !== null);

	it('seedRows alone leaves every reminder without heads-ups', async () => {
		seedRows(db as never, { now });
		expect(await withLeads()).toEqual([]);
	});

	it('sets heads-ups on exactly two reminders, one recurring, armed 30 days back', async () => {
		seedRows(db as never, { now });
		seedDemoReminderHeadsUps(db as never, { now });
		const rows = await withLeads();
		expect(rows).toHaveLength(2);
		expect(rows.filter((r) => r.isRecurring).map((r) => r.notifyLeadDays)).toEqual(['2']);
		expect(rows.filter((r) => !r.isRecurring).map((r) => r.notifyLeadDays)).toEqual(['7,1']);
		for (const r of rows) {
			expect(r.leadArmedAt!.getTime()).toBe(now - 30 * 24 * 60 * 60 * 1000);
		}
	});
});
