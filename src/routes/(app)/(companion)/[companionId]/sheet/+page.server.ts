import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { formatPrintedOn, loadCaretakerSheet } from '#lib/server/caretaker-sheet.js';

// Printable caretaker sheet (#280) for owners. GET only, no actions. The
// (companion) layout 404s unknown ids; archived companions print too.
export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	await parent();

	const sheet = await loadCaretakerSheet(params.companionId);
	if (!sheet) error(404, t(locals.locale, 'error.companionNotFound'));
	return { sheet, printedOn: formatPrintedOn(locals.locale) };
};
