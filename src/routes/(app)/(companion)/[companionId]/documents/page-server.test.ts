import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { load } from './+page.server';

const PET = 'dl-pet';
const OTHER = 'dl-other';
const NOW = new Date(2026, 10, 10, 12, 0, 0);

async function loadFor(companionId: string) {
	const event = {
		params: { companionId },
		locals: { user: { id: 'dl-user', role: 'member' }, locale: 'en' },
		parent: async () => ({ companion: { id: companionId } })
	};
	return (await (load as unknown as (e: never) => Promise<unknown>)(event as never)) as {
		purchaseByDocument: Record<string, { supplyId: string; supplyName: string }>;
	};
}

beforeAll(async () => {
	await db.insert(schema.companions).values([
		{ id: PET, name: 'Ein' },
		{ id: OTHER, name: 'Other' }
	]);
	await db.insert(schema.supplies).values([
		{ id: 'dl-linked', name: 'Kibble', kind: 'counted', quantity: 1 },
		{ id: 'dl-unlinked', name: 'Treats', kind: 'counted', quantity: 1 }
	]);
	await db.insert(schema.supplyCompanions).values([
		{ supplyId: 'dl-linked', companionId: PET },
		{ supplyId: 'dl-unlinked', companionId: OTHER }
	]);
	await db.insert(schema.documents).values(
		['dl-doc-linked', 'dl-doc-unlinked'].map((id) => ({
			id,
			companionId: PET,
			filename: `${id}.pdf`,
			storageKey: id,
			title: id,
			mimeType: 'application/pdf'
		}))
	);
	await db.insert(schema.supplyEvents).values([
		{ id: 'dl-e1', supplyId: 'dl-linked', type: 'purchase', at: NOW, documentId: 'dl-doc-linked' },
		{
			id: 'dl-e2',
			supplyId: 'dl-unlinked',
			type: 'purchase',
			at: NOW,
			documentId: 'dl-doc-unlinked'
		}
	]);
});

describe('documents load', () => {
	it('links a receipt only to a supply still linked to this pet', async () => {
		const { purchaseByDocument } = await loadFor(PET);
		expect(purchaseByDocument).toEqual({
			'dl-doc-linked': { supplyId: 'dl-linked', supplyName: 'Kibble' }
		});
	});
});
