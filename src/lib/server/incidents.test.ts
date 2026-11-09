import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import {
	createIncident,
	resolvedBeforeStart,
	getIncident,
	updateIncidentOverview,
	setIncidentResolved,
	createIncidentUpdate,
	getIncidentUpdate,
	editIncidentUpdate,
	deleteIncidentUpdate,
	listOpenIncidents,
	parseIncidentForm,
	parseIncidentUpdateForm
} from './incidents';

vi.mock('#lib/server/storage/media-blobs.js', () => ({
	deleteMediaBlobs: vi.fn(async () => {})
}));
const { deleteMediaBlobs } = await import('#lib/server/storage/media-blobs.js');

const C1 = 'c-incm1';
const C2 = 'c-incm2';
const U = 'u-incm';
const input = (over: Partial<Parameters<typeof createIncident>[1]> = {}) => ({
	title: 'Limping',
	notes: null,
	occurredAt: new Date('2026-05-01T10:00:00Z'),
	severity: 'mild' as const,
	...over
});

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: U, username: 'incm', displayName: 'Incm', role: 'member' });
	await db.insert(schema.companions).values([
		{ id: C1, name: 'A' },
		{ id: C2, name: 'B' }
	]);
});

beforeEach(() => {
	vi.mocked(deleteMediaBlobs).mockClear();
});

describe('incident data', () => {
	it('createIncident stores type incident, severity, no resolvedAt', async () => {
		const id = await createIncident(C1, input({ notes: 'cut paw' }), U);
		const row = await getIncident(C1, id);
		expect(row?.type).toBe('incident');
		expect(row?.severity).toBe('mild');
		expect(row?.resolvedAt).toBeNull();
		expect(row?.notes).toBe('cut paw');
		expect(row?.loggedBy).toBe(U);
	});

	it('getIncident returns undefined for a non-incident event and for another companion', async () => {
		await db.insert(schema.healthEvents).values({
			id: 'ev-vet',
			companionId: C1,
			type: 'vet_visit',
			title: 'Visit',
			occurredAt: new Date()
		});
		const id = await createIncident(C1, input(), U);
		expect(await getIncident(C1, 'ev-vet')).toBeUndefined();
		expect(await getIncident(C2, id)).toBeUndefined();
	});

	it('updateIncidentOverview edits fields and is scoped to the companion', async () => {
		const id = await createIncident(C1, input(), U);
		expect(await updateIncidentOverview(C2, id, input({ title: 'x' }))).toBe(false);
		expect(await updateIncidentOverview(C1, id, input({ title: 'Better', severity: null }))).toBe(
			true
		);
		const row = await getIncident(C1, id);
		expect(row?.title).toBe('Better');
		expect(row?.severity).toBeNull();
	});

	it('setIncidentResolved sets and clears resolvedAt', async () => {
		const id = await createIncident(C1, input(), U);
		const at = new Date('2026-05-05T10:00:00Z');
		expect(await setIncidentResolved(C1, id, at)).toBe(true);
		expect((await getIncident(C1, id))?.resolvedAt?.getTime()).toBe(at.getTime());
		expect(await setIncidentResolved(C1, id, null)).toBe(true);
		expect((await getIncident(C1, id))?.resolvedAt).toBeNull();
		expect(await setIncidentResolved(C2, id, at)).toBe(false);
	});

	it('creates, reads and edits updates scoped to the incident', async () => {
		const id = await createIncident(C1, input(), U);
		const other = await createIncident(C1, input({ title: 'Other' }), U);
		const at = new Date('2026-05-02T10:00:00Z');
		const upId = await createIncidentUpdate(id, { body: 'ok', severity: null, occurredAt: at }, U);
		expect((await getIncidentUpdate(id, upId))?.body).toBe('ok');
		expect(await getIncidentUpdate(other, upId)).toBeUndefined();
		expect(
			await editIncidentUpdate(id, upId, { body: 'worse', severity: 'severe', occurredAt: at })
		).toBe(true);
		const row = await getIncidentUpdate(id, upId);
		expect(row?.body).toBe('worse');
		expect(row?.severity).toBe('severe');
		expect(
			await editIncidentUpdate(other, upId, { body: 'x', severity: null, occurredAt: at })
		).toBe(false);
	});

	it('deleteIncidentUpdate removes the update and hands its media blobs to deleteMediaBlobs', async () => {
		const id = await createIncident(C1, input(), U);
		const upId = await createIncidentUpdate(
			id,
			{ body: 'pic', severity: null, occurredAt: new Date('2026-05-02T10:00:00Z') },
			U
		);
		const base = { filename: 'f.jpg', mimeType: 'image/jpeg', sizeBytes: 1 } as const;
		await db.insert(schema.media).values([
			{ id: 'm-ov', healthEventId: id, storageKey: 'k/ov.jpg', ...base },
			{
				id: 'm-up',
				healthEventId: id,
				updateId: upId,
				storageKey: 'k/up.jpg',
				originalKey: 'k/up-orig.jpg',
				posterKey: 'k/up-poster.jpg',
				...base
			}
		]);
		expect(await deleteIncidentUpdate('wrong-incident', upId)).toBe(false);
		expect(deleteMediaBlobs).not.toHaveBeenCalled();
		expect(await deleteIncidentUpdate(id, upId)).toBe(true);
		expect(deleteMediaBlobs).toHaveBeenCalledTimes(1);
		expect(deleteMediaBlobs).toHaveBeenCalledWith(
			[
				{
					provider: expect.anything(),
					storageKey: 'k/up.jpg',
					originalKey: 'k/up-orig.jpg',
					posterKey: 'k/up-poster.jpg'
				}
			],
			'incident-media'
		);
		expect(await getIncidentUpdate(id, upId)).toBeUndefined();
		expect(await db.select().from(schema.media).where(eq(schema.media.id, 'm-ov'))).toHaveLength(1);
		expect(await db.select().from(schema.media).where(eq(schema.media.id, 'm-up'))).toHaveLength(0);
	});

	it('listOpenIncidents excludes resolved incidents and other types and returns currentSeverity from the latest update', async () => {
		const L = 'c-incm-list';
		await db.insert(schema.companions).values({ id: L, name: 'L' });
		const open = await createIncident(
			L,
			input({ title: 'Open', occurredAt: new Date('2026-06-01T10:00:00Z') }),
			U
		);
		const older = await createIncident(
			L,
			input({ title: 'Older', occurredAt: new Date('2026-05-01T10:00:00Z') }),
			U
		);
		const done = await createIncident(L, input({ title: 'Done' }), U);
		await setIncidentResolved(L, done, new Date());
		await db.insert(schema.healthEvents).values({
			id: 'ev-list-vet',
			companionId: L,
			type: 'vet_visit',
			title: 'Visit',
			occurredAt: new Date()
		});
		await createIncidentUpdate(
			open,
			{ body: 'first', severity: 'severe', occurredAt: new Date('2026-06-02T10:00:00Z') },
			U
		);
		await createIncidentUpdate(
			open,
			{ body: 'latest', severity: 'moderate', occurredAt: new Date('2026-06-03T10:00:00Z') },
			U
		);
		await createIncidentUpdate(
			open,
			{ body: 'no sev', severity: null, occurredAt: new Date('2026-06-04T10:00:00Z') },
			U
		);

		const list = await listOpenIncidents([L]);
		expect(list.map((i) => i.id)).toEqual([open, older]);
		expect(list[0].currentSeverity).toBe('moderate');
		expect(list[0].lastActivityAt.toISOString()).toBe('2026-06-04T10:00:00.000Z');
		expect(list[0].latestUpdate?.body).toBe('no sev');
		expect(list[1].currentSeverity).toBe('mild');
		expect(list[1].latestUpdate).toBeNull();
		expect(list[1].lastActivityAt.toISOString()).toBe('2026-05-01T10:00:00.000Z');
		expect(await listOpenIncidents([])).toEqual([]);
	});
});

function form(fields: Record<string, string>) {
	const fd = new FormData();
	for (const [k, v] of Object.entries(fields)) fd.set(k, v);
	return fd;
}

describe('parseIncidentForm', () => {
	const ok = { title: 'Limp', notes: 'n', severity: 'mild', occurredAt: '2026-05-01T10:00' };
	it('parses a valid form', () => {
		const r = parseIncidentForm(form(ok), 'en', { allowStart: true });
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.title).toBe('Limp');
			expect(r.value.severity).toBe('mild');
		}
	});
	it('rejects empty title', () => {
		expect(parseIncidentForm(form({ ...ok, title: ' ' }), 'en', { allowStart: true }).ok).toBe(
			false
		);
	});
	it('rejects too-long fields', () => {
		const long = 'x'.repeat(MAX_NOTE_LEN + 1);
		expect(parseIncidentForm(form({ ...ok, title: long }), 'en', { allowStart: true }).ok).toBe(
			false
		);
		expect(parseIncidentForm(form({ ...ok, notes: long }), 'en', { allowStart: true }).ok).toBe(
			false
		);
	});
	it('treats invalid or blank severity as none', () => {
		for (const severity of ['', 'bogus']) {
			const r = parseIncidentForm(form({ ...ok, severity }), 'en', { allowStart: true });
			expect(r.ok && r.value.severity).toBeNull();
		}
	});
	it('rejects an invalid start time', () => {
		expect(
			parseIncidentForm(form({ ...ok, occurredAt: 'nope' }), 'en', { allowStart: true }).ok
		).toBe(false);
	});
	it('uses now when the start is not allowed', () => {
		const before = Date.now();
		const r = parseIncidentForm(form({ ...ok, occurredAt: '2001-01-01T00:00' }), 'en', {
			allowStart: false
		});
		expect(r.ok && r.value.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
	});
});

describe('parseIncidentUpdateForm', () => {
	it('rejects empty body', () => {
		expect(
			parseIncidentUpdateForm(form({ body: '  ', severity: '' }), 'en', { allowTime: true }).ok
		).toBe(false);
	});
	it('rejects too-long body', () => {
		expect(
			parseIncidentUpdateForm(form({ body: 'x'.repeat(MAX_NOTE_LEN + 1) }), 'en', {
				allowTime: true
			}).ok
		).toBe(false);
	});
	it('parses severity and honors allowTime', () => {
		const r = parseIncidentUpdateForm(
			form({ body: 'better', severity: 'moderate', occurredAt: '2001-01-01T00:00' }),
			'en',
			{ allowTime: false }
		);
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.value.severity).toBe('moderate');
			expect(r.value.occurredAt.getFullYear()).toBeGreaterThan(2020);
		}
	});
});

describe('resolvedBeforeStart', () => {
	const start = new Date('2026-01-02T10:05:42Z');
	it('rejects an earlier minute', () => {
		expect(resolvedBeforeStart(start, new Date('2026-01-02T10:04:59Z'))).toBe(true);
	});
	it('allows the same minute despite seconds', () => {
		expect(resolvedBeforeStart(start, new Date('2026-01-02T10:05:00Z'))).toBe(false);
	});
	it('allows later', () => {
		expect(resolvedBeforeStart(start, new Date('2026-01-02T11:00:00Z'))).toBe(false);
	});
});
