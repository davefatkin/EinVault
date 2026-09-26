import { describe, it, expect } from 'vitest';
import { actions } from './+page.server';

describe('new companion (route action)', () => {
	function event(formEntries: [string, string][]) {
		const form = new FormData();
		for (const [k, v] of formEntries) form.append(k, v);
		return {
			request: { formData: async () => form },
			locals: { user: { id: 'nc-member', role: 'member' as const }, locale: 'en' as const }
		} as unknown as Parameters<typeof actions.default>[0];
	}

	it('echoes species and weight unit back when the name is missing', async () => {
		const result = await actions.default(
			event([
				['name', ''],
				['species', 'cat'],
				['weightUnit', 'kg']
			])
		);
		expect(result).toMatchObject({ status: 400, data: { species: 'cat', weightUnit: 'kg' } });
	});

	it('echoes null for a missing species and keeps the posted unit', async () => {
		const result = await actions.default(
			event([
				['name', 'Nameless'],
				['weightUnit', 'oz']
			])
		);
		expect(result).toMatchObject({
			status: 400,
			data: { name: 'Nameless', species: null, weightUnit: 'oz' }
		});
	});
});
