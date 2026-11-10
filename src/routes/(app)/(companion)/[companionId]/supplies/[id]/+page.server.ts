import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '#lib/i18n/index.js';
import { localDateISO } from '#lib/date.js';
import { getAppSettings } from '#lib/server/app-settings.js';
import {
	correctCount,
	deleteSupply,
	deleteSupplyEvent,
	getSupplyForCompanion,
	listSupplyEvents,
	loadSupplyStates,
	parseAmount,
	toSupplySummary
} from '#lib/server/supplies.js';
import { purchaseAction, supplyOwnerOnly } from '#lib/server/supply-actions.js';
import { exceedsLen } from '#lib/server/validation.js';
import { MAX_NOTE_LEN } from '#lib/textLimits.js';
import { MAX_SUPPLY_QUANTITY } from '#lib/supplies.js';

const EVENT_PAGE = 50;
const MAX_EVENT_PAGES = 20;

export const load: PageServerLoad = async ({ params, locals, parent, url }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();
	const today = localDateISO();
	const [[state], row] = await Promise.all([
		loadSupplyStates({ companionId: params.companionId, supplyId: params.id, today }),
		getSupplyForCompanion(params.companionId, params.id)
	]);
	if (!state || !row) error(404, t(locals.locale, 'error.supplyNotFound'));

	// "Show more" grows the history a page at a time.
	const pages = Math.min(
		Math.max(1, Math.floor(Number(url.searchParams.get('history')) || 1)),
		MAX_EVENT_PAGES
	);
	const [events, { currency }] = await Promise.all([
		listSupplyEvents(state.id, pages * EVENT_PAGE + 1),
		getAppSettings()
	]);
	return {
		companion,
		supply: toSupplySummary(state),
		notes: row.notes,
		events: events.slice(0, pages * EVENT_PAGE),
		// At the cap there is no next page, so "Show more" goes away.
		moreEvents: events.length > pages * EVENT_PAGE && pages < MAX_EVENT_PAGES ? pages + 1 : null,
		currency,
		today
	};
};

export const actions: Actions = {
	purchase: purchaseAction,

	correct: async ({ request, params, locals }) => {
		const denied = await supplyOwnerOnly(locals, params.companionId, params.id);
		if (denied) return denied;
		const data = await request.formData();
		const actual = parseAmount(data.get('actual'));
		if (actual === 'tooLarge')
			return fail(400, {
				error: t(locals.locale, 'error.quantityTooLarge', { max: MAX_SUPPLY_QUANTITY })
			});
		if (typeof actual !== 'number')
			return fail(400, { error: t(locals.locale, 'error.invalidQuantity') });
		const note = String(data.get('note') ?? '').trim();
		if (exceedsLen(note, MAX_NOTE_LEN))
			return fail(400, { error: t(locals.locale, 'error.noteTooLong', { max: MAX_NOTE_LEN }) });
		const outcome = await correctCount(params.id, actual, locals.user!.id, note || null);
		if (outcome === 'notFound')
			return fail(404, { error: t(locals.locale, 'error.supplyNotFound') });
		return { corrected: true };
	},

	deleteEvent: async ({ request, params, locals }) => {
		const denied = await supplyOwnerOnly(locals, params.companionId, params.id);
		if (denied) return denied;
		const data = await request.formData();
		const eventId = String(data.get('eventId') ?? '');
		if (!eventId || !(await deleteSupplyEvent(params.id, eventId)))
			return fail(404, { error: t(locals.locale, 'error.supplyEventNotFound') });
		return { eventDeleted: true };
	},

	delete: async ({ params, locals }) => {
		const denied = await supplyOwnerOnly(locals, params.companionId, params.id);
		if (denied) return denied;
		if (!(await deleteSupply(params.id)))
			return fail(404, { error: t(locals.locale, 'error.supplyNotFound') });
		redirect(303, `/${params.companionId}/supplies`);
	}
};
