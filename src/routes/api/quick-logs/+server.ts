import { json } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/auth/api-request';
import { listQuickLogButtons } from '$lib/server/quick-logs';
import { toApiQuickLog } from '$lib/server/api-serializers';

// Bearer-token endpoint: list the token user's enabled quick logs so device
// setup can discover ids for /api/quick-logs/{id}/execute.
export const GET = apiRoute(async ({ user }) => {
	const buttons = await listQuickLogButtons({ id: user.id, role: user.role });
	return json({ quickLogs: buttons.map(toApiQuickLog) });
});
