import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { UPLOAD_MAX_MB } from '$lib/server/env';

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	// Documents are owner-private; caretakers never reach this route group,
	// but a defense-in-depth redirect costs nothing.
	if (locals.user.role === 'caretaker') redirect(302, '/care');
	const { companion } = await parent();

	const [documents, healthEvents] = await Promise.all([
		db.query.documents.findMany({
			where: eq(schema.documents.companionId, params.companionId),
			orderBy: (d, { desc }) => [desc(d.createdAt)],
			with: {
				healthEvent: { columns: { id: true, title: true } },
				uploader: { columns: { displayName: true } }
			}
		}),
		db.query.healthEvents.findMany({
			where: eq(schema.healthEvents.companionId, params.companionId),
			orderBy: (h, { desc }) => [desc(h.occurredAt)],
			columns: { id: true, title: true, occurredAt: true }
		})
	]);

	return { companion, documents, healthEvents, uploadMaxMb: UPLOAD_MAX_MB };
};
