import { apiRoute } from '$lib/server/auth/api-request';
import { withIdempotency } from '$lib/server/api-idempotency';
import { throwCareError } from '$lib/server/care-errors';
import { executeQuickLog } from '$lib/server/quick-logs';
import { parseIdArray, parseLoggedAt } from '$lib/server/validation';

// Bearer-token endpoint: run one of the token user's configured quick logs.
// Body optional: { companionIds?, loggedAt? }. With no body the remembered/
// assigned target set is used, so a physical button only stores URL + token
// and all configuration lives in the app. API execution never rewrites the
// remembered UI preference.
export const POST = apiRoute(async ({ event, user, tokenId, locale }) => {
	const body = await event.request.json().catch(() => null);
	const companionIds = body ? parseIdArray(body.companionIds) : [];
	const quickLogId = event.params.id!;

	return withIdempotency(
		{ request: event.request, tokenId, endpoint: `quick-logs/${quickLogId}/execute`, body },
		async () => {
			const result = await executeQuickLog({
				user: { id: user.id, role: user.role },
				quickLogId,
				companionIds: companionIds.length > 0 ? companionIds : undefined,
				loggedAt: body ? (parseLoggedAt(body.loggedAt) ?? undefined) : undefined
			});
			// Not-owned reads as notFound (404) so token holders can't probe other users' ids.
			if (!result.ok) throwCareError(result.code, locale);
			return { status: 201, data: { ids: result.ids } };
		}
	);
});
