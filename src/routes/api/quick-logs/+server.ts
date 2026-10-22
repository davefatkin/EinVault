import { apiRoute } from '#lib/server/auth/api-request.js';
import { listQuickLogButtons } from '#lib/server/quick-logs.js';
import { toApiQuickLog } from '#lib/server/api-serializers.js';

// Bearer-token endpoint: list the token user's enabled quick logs so device
// setup can discover ids for /api/quick-logs/{id}/execute.
export const GET = apiRoute(async ({ user }) => {
	const buttons = await listQuickLogButtons({ id: user.id, role: user.role });
	return Response.json({ quickLogs: buttons.map(toApiQuickLog) });
});
