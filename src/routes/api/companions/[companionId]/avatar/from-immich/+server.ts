import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { getImmichClient, getStorage, immichKey } from '$lib/server/storage';
import type { StorageProvider } from '$lib/server/storage';

const ALLOWED_MIME_PREFIXES = ['image/'];
const ASSET_ID_RE = /^[a-zA-Z0-9-]+$/;
const LEGACY_EXTS = ['jpg', 'png', 'webp'];

function avatarLegacyKey(companionId: string, ext: string): string {
	return `avatars/${companionId}.${ext}`;
}

function resolveExistingKey(
	provider: StorageProvider,
	storedKey: string | null,
	avatarPath: string | null
): string | null {
	if (storedKey) return storedKey;
	if (provider === 'local' && avatarPath) return `avatars/${avatarPath}`;
	return null;
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') {
		const assigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.userId, locals.user.id),
				eq(schema.companionCaretakers.companionId, params.companionId)
			)
		});
		if (!assigned) error(403, t(locals.locale, 'error.forbidden'));
	}

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !ASSET_ID_RE.test(assetId)) error(400, 'Invalid asset id');

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));
	if (!ALLOWED_MIME_PREFIXES.some((p) => asset.originalMimeType.startsWith(p))) {
		error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));
	}

	// Remove the previous avatar from wherever it lives. Skip if previous was
	// also Immich-referenced — we never delete from Immich.
	const existingKey = resolveExistingKey(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath
	);
	if (existingKey && companion.avatarProvider !== 'immich') {
		await getStorage(companion.avatarProvider).delete(existingKey);
	}
	if (companion.avatarProvider === 'local') {
		const local = getStorage('local');
		for (const ext of LEGACY_EXTS) {
			await local.delete(avatarLegacyKey(params.companionId, ext));
		}
	}

	const ext = asset.originalFileName.split('.').pop()?.toLowerCase() || 'jpg';
	const filename = `${assetId}.${ext}`;
	const key = immichKey(assetId);

	await db
		.update(schema.companions)
		.set({
			avatarPath: filename,
			avatarProvider: 'immich',
			avatarStorageKey: key
		})
		.where(eq(schema.companions.id, params.companionId));

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};
