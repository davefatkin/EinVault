import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db, schema } from '#lib/server/db/index.js';
import { eq, inArray } from 'drizzle-orm';
import { UPLOAD_MAX_MB } from '#lib/server/env.js';

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
			columns: { id: true, title: true, type: true, occurredAt: true }
		})
	]);

	// Receipts recorded with a supply purchase link back to that supply.
	const purchaseByDocument: Record<string, { supplyId: string; supplyName: string }> = {};
	if (documents.length > 0) {
		const purchases = db
			.select({
				documentId: schema.supplyEvents.documentId,
				supplyId: schema.supplies.id,
				supplyName: schema.supplies.name
			})
			.from(schema.supplyEvents)
			.innerJoin(schema.supplies, eq(schema.supplies.id, schema.supplyEvents.supplyId))
			.where(
				inArray(
					schema.supplyEvents.documentId,
					documents.map((d) => d.id)
				)
			)
			.all();
		for (const p of purchases) {
			if (p.documentId) {
				purchaseByDocument[p.documentId] ??= { supplyId: p.supplyId, supplyName: p.supplyName };
			}
		}
	}

	return { companion, documents, healthEvents, purchaseByDocument, uploadMaxMb: UPLOAD_MAX_MB };
};
