import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { formatPrintedOn, loadCaretakerSheet } from '$lib/server/caretaker-sheet';

// Printable caretaker sheet (#280) for an assigned caretaker, e.g. to hand to
// a backup sitter. Same rule as the care page: assigned and active (the
// layout's companions list); the shift doesn't matter. GET only, no actions.
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { companions } = await parent();
	if (!companions.some((c) => c.id === params.companionId)) {
		error(403, t(locals.locale, 'error.notAssignedToCompanion'));
	}

	const sheet = await loadCaretakerSheet(params.companionId);
	if (!sheet) error(404, t(locals.locale, 'error.companionNotFound'));
	return { sheet, printedOn: formatPrintedOn(locals.locale) };
};
