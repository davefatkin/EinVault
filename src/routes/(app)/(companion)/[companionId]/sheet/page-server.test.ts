import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db, schema } from '$lib/server/db';
import type { CaretakerSheet } from '$lib/caretakerSheet';
import { load } from './+page.server';

// #280: the owner sheet route. The (companion) layout 404s unknown ids and
// allows archived companions; the page repeats the owner checks.
describe('owner caretaker sheet load', () => {
	const companionId = 'ows-c';
	const archivedId = 'ows-archived';

	beforeAll(async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 0, 15, 12, 0));
		await db.insert(schema.companions).values([
			{ id: companionId, name: 'Rex', vetPhone: '555-0100' },
			{ id: archivedId, name: 'Old Rex', isActive: false }
		]);
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	async function run(id: string, locale = 'en', role = 'member') {
		return (await load({
			params: { companionId: id },
			locals: { user: { id: 'ows-u', role }, locale },
			parent: async () => ({ companion: { id } })
		} as unknown as Parameters<typeof load>[0])) as { sheet: CaretakerSheet; printedOn: string };
	}

	it('returns the sheet and a long printed-on date', async () => {
		const data = await run(companionId);
		expect(data.sheet.companion.name).toBe('Rex');
		expect(data.sheet.vet).toEqual({ name: null, clinic: null, phone: '555-0100' });
		expect(data.printedOn).toBe('January 15, 2026');
	});

	it("formats the date in the viewer's locale", async () => {
		expect((await run(companionId, 'de')).printedOn).toBe('15. Januar 2026');
	});

	it('works for an archived companion', async () => {
		expect((await run(archivedId)).sheet.companion.name).toBe('Old Rex');
	});

	it('404s when the companion is gone', async () => {
		await expect(run('ows-missing')).rejects.toMatchObject({ status: 404 });
	});

	it('sends caretakers to /care', async () => {
		await expect(run(companionId, 'en', 'caretaker')).rejects.toMatchObject({
			status: 302,
			location: '/care'
		});
	});
});
