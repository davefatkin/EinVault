import { error } from '@sveltejs/kit';
import { t } from '#lib/i18n/index.js';
import { apiRoute } from '#lib/server/auth/api-request.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import { listMedicationSummaries } from '#lib/server/medications.js';
import { toApiMedication } from '#lib/server/api-serializers.js';

// GET /api/medications?companionId=&status=active|all. Full- and write-scope
// tokens may read it (like /api/quick-logs, so a log-only device can find the
// ids for POST /api/medications/{id}/doses). Without companionId, lists across
// every companion the token user may access. Caretakers only ever see active
// medications, whatever status they ask for. Shift-independent, like the
// companions list: reading grants no write capability.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	const status = event.url.searchParams.get('status');
	if (status !== null && status !== 'active' && status !== 'all')
		error(400, t(locale, 'error.invalidMedicationStatus'), { code: 'invalidStatus' });
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	const companionId = event.url.searchParams.get('companionId');
	let ids = allowed;
	if (companionId) {
		if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);
		ids = [companionId];
	}
	const activeOnly = status !== 'all' || user.role === 'caretaker';

	const medications = await listMedicationSummaries(ids, { activeOnly });
	return Response.json({
		medications: medications.map((m) => toApiMedication(m, { omitPeople: scope === 'write' }))
	});
});
