import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { localDateISO } from '$lib/date';
import { getDayItems, listDayItemDates } from './journal-day-items';

// Day bucketing must follow the server TZ. Node re-reads TZ on assignment
// (tzset), so SQLite's 'localtime' and JS Date agree after this.
const ORIGINAL_TZ = process.env.TZ;
const setTz = (tz: string | undefined) => {
	if (tz === undefined) delete process.env.TZ;
	else process.env.TZ = tz;
};
beforeAll(() => setTz('America/New_York'));
afterAll(() => setTz(ORIGINAL_TZ));

let seq = 0;
const nextId = (p: string) => `${p}-${++seq}`;

async function addCompanion(id: string) {
	await db
		.insert(schema.companions)
		.values({ id, name: id } as typeof schema.companions.$inferInsert);
}

async function addHealth(companionId: string, at: Date, title = 'Vet visit') {
	const id = nextId('he');
	await db.insert(schema.healthEvents).values({
		id,
		companionId,
		type: 'vet_visit',
		title,
		occurredAt: at
	});
	return id;
}

async function addWeight(companionId: string, at: Date, weight = 12.5) {
	const id = nextId('w');
	await db.insert(schema.weightEntries).values({
		id,
		companionId,
		weight,
		unit: 'kg',
		recordedAt: at
	});
	return id;
}

async function addDoc(
	companionId: string,
	opts: {
		title: string;
		documentDate?: string | null;
		createdAt?: Date;
		healthEventId?: string | null;
	}
) {
	const id = nextId('doc');
	await db.insert(schema.documents).values({
		id,
		companionId,
		healthEventId: opts.healthEventId ?? null,
		filename: `${id}.pdf`,
		provider: 'local',
		storageKey: `documents/${companionId}/${id}.pdf`,
		title: opts.title,
		category: 'medical',
		documentDate: opts.documentDate ?? null,
		mimeType: 'application/pdf',
		createdAt: opts.createdAt ?? new Date()
	});
	return id;
}

const noon = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12, 0);

describe.each(['America/New_York', 'Asia/Tokyo'])('day bucketing in %s', (tz) => {
	const c = `c-di-tz-${tz.replace('/', '-')}`;

	beforeAll(async () => {
		setTz(tz);
		await addCompanion(c);
	});
	afterAll(() => setTz('America/New_York'));

	it('sqlite localtime follows the process TZ', () => {
		const at = new Date(2026, 2, 10, 23, 30);
		const row = db.get<{ d: string }>(
			sql`select date(${Math.floor(at.getTime() / 1000)}, 'unixepoch', 'localtime') as d`
		);
		expect(row.d).toBe(localDateISO(at));
	});

	it('puts each kind on its local day at 23:30 and at 00:30', async () => {
		const late = new Date(2026, 2, 10, 23, 30);
		const early = new Date(2026, 2, 12, 0, 30);
		const h1 = await addHealth(c, late, 'late vet');
		const h2 = await addHealth(c, early, 'early vet');
		const w1 = await addWeight(c, late);
		const w2 = await addWeight(c, early);
		const d1 = await addDoc(c, { title: 'late upload', createdAt: late });
		const d2 = await addDoc(c, { title: 'early upload', createdAt: early });

		const items = await getDayItems(c, { from: '2026-03-09', to: '2026-03-13' });
		expect([...items.keys()].sort()).toEqual(['2026-03-10', '2026-03-12']);
		expect(items.get('2026-03-10')!.map((i) => i.id)).toEqual([h1, w1, d1]);
		expect(items.get('2026-03-12')!.map((i) => i.id)).toEqual([h2, w2, d2]);

		const dates = await listDayItemDates(c, { limit: 10 });
		expect(dates).toEqual(['2026-03-12', '2026-03-10']);
	});
});

describe('documents and their health events', () => {
	const c = 'c-di-docs';
	const other = 'c-di-docs-other';
	let eventId: string;
	let otherEventId: string;
	const ids: Record<string, string> = {};

	beforeAll(async () => {
		await addCompanion(c);
		await addCompanion(other);
		eventId = await addHealth(c, noon(2026, 4, 1), 'Dental cleaning');
		otherEventId = await addHealth(other, noon(2026, 4, 1), 'Other vet');

		ids.undatedUnattached = await addDoc(c, {
			title: 'receipt',
			createdAt: new Date(2026, 3, 2, 23, 30)
		});
		ids.attachedUndated = await addDoc(c, {
			title: 'xray',
			healthEventId: eventId,
			createdAt: noon(2026, 4, 5)
		});
		ids.attachedOwnDate = await addDoc(c, {
			title: 'invoice',
			healthEventId: eventId,
			documentDate: '2026-04-03',
			createdAt: noon(2026, 4, 6)
		});
		ids.attachedSameDate = await addDoc(c, {
			title: 'report',
			healthEventId: eventId,
			documentDate: '2026-04-01',
			createdAt: noon(2026, 4, 7)
		});
		ids.crossCompanion = await addDoc(c, {
			title: 'misfiled',
			healthEventId: otherEventId,
			createdAt: noon(2026, 4, 8)
		});

		const doomed = await addHealth(c, noon(2026, 4, 9), 'deleted event');
		ids.orphaned = await addDoc(c, {
			title: 'orphan',
			healthEventId: doomed,
			createdAt: noon(2026, 4, 9)
		});
		await db.delete(schema.healthEvents).where(eq(schema.healthEvents.id, doomed));
	});

	it('lists every attached document under its event, ordered by upload', async () => {
		const items = await getDayItems(c, { from: '2026-04-01', to: '2026-04-01' });
		const [event] = items.get('2026-04-01')!;
		expect(event.kind).toBe('health');
		if (event.kind !== 'health') return;
		expect(event.documents.map((d) => d.id)).toEqual([
			ids.attachedUndated,
			ids.attachedOwnDate,
			ids.attachedSameDate
		]);
		expect(event.documents[0].date).toBe('2026-04-05');
		expect(items.get('2026-04-01')).toHaveLength(1); // the same-date doc is not also standalone
	});

	it('places standalone documents on their own day', async () => {
		const items = await getDayItems(c, { from: '2026-03-31', to: '2026-04-10' });
		const standalone = (day: string) => (items.get(day) ?? []).filter((i) => i.kind === 'document');

		// unattached, no documentDate: local upload day (23:30 stays on the 2nd)
		expect(standalone('2026-04-02')).toEqual([
			expect.objectContaining({ id: ids.undatedUnattached, eventTitle: null, date: '2026-04-02' })
		]);
		// attached with a different documentDate: standalone with the event title
		expect(standalone('2026-04-03')).toEqual([
			expect.objectContaining({ id: ids.attachedOwnDate, eventTitle: 'Dental cleaning' })
		]);
		// attached and undated: only under the event, never on its upload day
		expect(items.has('2026-04-05')).toBe(false);
		// linked to another companion's event: standalone, unattached
		expect(standalone('2026-04-08')).toEqual([
			expect.objectContaining({ id: ids.crossCompanion, eventTitle: null })
		]);
		// event deleted (health_event_id set null): standalone
		expect(standalone('2026-04-09')).toEqual([
			expect.objectContaining({ id: ids.orphaned, eventTitle: null })
		]);
	});

	it("never lists a document under another companion's event", async () => {
		const items = await getDayItems(other, { from: '2026-04-01', to: '2026-04-30' });
		const [event] = items.get('2026-04-01')!;
		expect(event.kind === 'health' && event.documents).toEqual([]);
		expect([...items.values()].flat().map((i) => i.id)).toEqual([otherEventId]);
	});

	it('exposes display fields only', async () => {
		const items = await getDayItems(c, { from: '2026-04-01', to: '2026-04-03' });
		const event = items.get('2026-04-01')![0];
		const doc = items.get('2026-04-03')![0];
		expect(Object.keys(event).sort()).toEqual(['at', 'documents', 'id', 'kind', 'title', 'type']);
		expect(event.kind === 'health' && Object.keys(event.documents[0]).sort()).toEqual(
			['category', 'date', 'filename', 'id', 'mimeType', 'title'].sort()
		);
		expect(Object.keys(doc).sort()).toEqual(
			['category', 'date', 'eventTitle', 'filename', 'id', 'kind', 'mimeType', 'title'].sort()
		);
		expect(typeof (event as { at: unknown }).at).toBe('string');
	});

	it('lists day keys that match the standalone placement', async () => {
		const dates = await listDayItemDates(c, { before: '2026-04-30', limit: 20 });
		expect(dates).toEqual(['2026-04-09', '2026-04-08', '2026-04-03', '2026-04-02', '2026-04-01']);
	});
});

describe('ordering within a day', () => {
	const c = 'c-di-order';

	it('orders health by time, then weights by time, then documents by upload', async () => {
		await addCompanion(c);
		const docLate = await addDoc(c, { title: 'b', createdAt: new Date(2026, 4, 20, 20, 0) });
		const hLate = await addHealth(c, new Date(2026, 4, 20, 15, 0));
		const wLate = await addWeight(c, new Date(2026, 4, 20, 18, 0));
		const docEarly = await addDoc(c, { title: 'a', createdAt: new Date(2026, 4, 20, 7, 0) });
		const hEarly = await addHealth(c, new Date(2026, 4, 20, 9, 0));
		const wEarly = await addWeight(c, new Date(2026, 4, 20, 8, 0));

		const items = await getDayItems(c, { from: '2026-05-20', to: '2026-05-20' });
		expect(items.get('2026-05-20')!.map((i) => i.id)).toEqual([
			hEarly,
			hLate,
			wEarly,
			wLate,
			docEarly,
			docLate
		]);
	});
});

describe('listDayItemDates', () => {
	const c = 'c-di-dates';
	const day = 86_400_000;

	beforeAll(async () => {
		await addCompanion(c);
		await addHealth(c, noon(2026, 6, 1));
		await addWeight(c, noon(2026, 6, 1)); // same day: listed once
		await addWeight(c, noon(2026, 6, 3));
		await addDoc(c, { title: 'dated', documentDate: '2026-06-05' });
		await addWeight(c, new Date(Date.now() + 2 * day)); // future
		await addDoc(c, {
			title: 'future',
			documentDate: localDateISO(new Date(Date.now() + 30 * day))
		});
	});

	it('returns distinct days newest first, never after today', async () => {
		const dates = await listDayItemDates(c, { limit: 10 });
		expect(dates).toEqual(['2026-06-05', '2026-06-03', '2026-06-01']);
	});

	it('respects before and limit', async () => {
		expect(await listDayItemDates(c, { before: '2026-06-05', limit: 10 })).toEqual([
			'2026-06-03',
			'2026-06-01'
		]);
		expect(await listDayItemDates(c, { limit: 2 })).toEqual(['2026-06-05', '2026-06-03']);
	});

	it('still returns future items for an explicit range', async () => {
		const future = localDateISO(new Date(Date.now() + 2 * day));
		const items = await getDayItems(c, { from: future, to: future });
		expect(items.get(future)?.map((i) => i.kind)).toEqual(['weight']);
	});
});
