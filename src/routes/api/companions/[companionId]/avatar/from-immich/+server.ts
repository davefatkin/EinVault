import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { getImmichClient, getStorage, immichKey, IMMICH_ASSET_ID_RE } from '$lib/server/storage';
import {
	AVATAR_LEGACY_EXTS,
	avatarLegacyKey,
	resolveExistingAvatarKey
} from '$lib/server/storage/avatarKeys';
import { isAllowedAvatarMime, safeExtFromMime } from '$lib/server/storage/mime';
import { assertCanEditCompanion } from '$lib/server/permissions';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	await assertCanEditCompanion(locals, params.companionId);

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !IMMICH_ASSET_ID_RE.test(assetId)) {
		error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));
	if (!isAllowedAvatarMime(asset.originalMimeType)) {
		error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));
	}

	const ext = safeExtFromMime(asset.originalMimeType, asset.originalFileName);
	const filename = `${assetId}.${ext}`;
	const key = immichKey(assetId);

	// Snapshot the previous avatar BEFORE updating the DB so that on success we
	// can clean it up. If we deleted first and the DB update failed, the user
	// would be left with no avatar but a dangling row.
	const previousKey = resolveExistingAvatarKey(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath
	);
	const previousProvider = companion.avatarProvider;

	await db
		.update(schema.companions)
		.set({
			avatarPath: filename,
			avatarProvider: 'immich',
			avatarStorageKey: key
		})
		.where(eq(schema.companions.id, params.companionId));

	// Clean up the prior avatar after the DB now points at the new one. Best
	// effort: never throw if cleanup fails — the new avatar is already live.
	if (previousKey && previousProvider !== 'immich') {
		try {
			await getStorage(previousProvider).delete(previousKey);
		} catch (err) {
			console.warn('[avatar/from-immich] failed to delete previous avatar:', err);
		}
	}
	if (previousProvider === 'local') {
		const local = getStorage('local');
		for (const legacyExt of AVATAR_LEGACY_EXTS) {
			try {
				await local.delete(avatarLegacyKey(params.companionId, legacyExt));
			} catch {
				// ignore — best effort sweep
			}
		}
	}

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};
