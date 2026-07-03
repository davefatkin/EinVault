import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireApiToken } from '$lib/server/auth/api-request';
import { listQuickLogButtons } from '$lib/server/quick-logs';

// Bearer-token endpoint: list the token user's enabled quick logs so device
// setup can discover ids for /api/quick-logs/{id}/execute.
export const GET: RequestHandler = async (event) => {
	const { user } = await requireApiToken(event);
	const buttons = await listQuickLogButtons({ id: user.id, role: user.role });
	return json({
		quickLogs: buttons.map((b) => ({
			id: b.id,
			name: b.name,
			type: b.type,
			durationMinutes: b.durationMinutes,
			note: b.note,
			companionIds: b.companionIds
		}))
	});
};
