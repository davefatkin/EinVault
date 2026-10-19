import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import type { CaretakerSheet } from '#lib/caretakerSheet.js';
import { load } from './+page.server';

// #280: the caretaker sheet route. parent().companions is the (caretaker)
// layout's assigned + active list, so an archived companion is absent from it
// and lands on the same 403. The shift doesn't matter.
describe('caretaker sheet load', () => {
	const companionId = 'cts-c';

	beforeAll(async () => {
		await db.insert(schema.companions).values({ id: companionId, name: 'Rex' });
	});

	async function run(id: string, assigned: string[]) {
		return (await load({
			params: { companionId: id },
			locals: { user: { id: 'cts-u', role: 'caretaker' }, locale: 'en' },
			parent: async () => ({ companions: assigned.map((a) => ({ id: a })), isOnShift: false })
		} as unknown as Parameters<typeof load>[0])) as { sheet: CaretakerSheet; printedOn: string };
	}

	it('returns the sheet for an assigned companion, off shift too', async () => {
		const data = await run(companionId, [companionId]);
		expect(data.sheet.companion.name).toBe('Rex');
		expect(typeof data.printedOn).toBe('string');
	});

	it('403s when the companion is not in the assigned, active list', async () => {
		await expect(run(companionId, ['someone-else'])).rejects.toMatchObject({
			status: 403,
			body: { message: 'Not assigned to this companion.' }
		});
	});

	it('404s when an assigned id has no companion row', async () => {
		await expect(run('cts-gone', ['cts-gone'])).rejects.toMatchObject({ status: 404 });
	});
});
