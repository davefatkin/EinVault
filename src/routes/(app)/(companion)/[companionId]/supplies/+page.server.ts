import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { localDateISO } from '#lib/date.js';
import { loadSupplyStates, toSupplySummary } from '#lib/server/supplies.js';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const states = await loadSupplyStates({ companionId: params.companionId, today: localDateISO() });
	// Needing attention first, then by name.
	const collator = new Intl.Collator(locals.locale);
	const supplies = states
		.map(toSupplySummary)
		.sort(
			(a, b) =>
				Number(b.runningLow || b.expiring) - Number(a.runningLow || a.expiring) ||
				collator.compare(a.name, b.name)
		);
	return { companion, supplies };
};
