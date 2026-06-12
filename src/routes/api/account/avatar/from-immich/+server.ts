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
import type { StorageProvider } from '$lib/server/storage/types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	// Caretakers cannot browse Immich; matches companion/from-immich and keeps
	// the integration scoped to family members/admins only.
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !IMMICH_ASSET_ID_RE.test(assetId)) {
		error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));
	}

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));

	const userId = locals.user.id;
	const entityId = `user-${userId}`;
	const ext = asset.originalFileName.split('.').pop() ?? 'jpg';
	const filename = `${assetId}.${ext}`;
	const key = immichKey(assetId);

	// Snapshot the previous avatar BEFORE updating the DB so that on success we
	// can clean it up. If we deleted first and the DB update failed, the user
	// would be left with no avatar but a dangling row.
	const existing = await db.query.users.findFirst({
		where: eq(schema.users.id, userId),
		columns: { avatarPath: true, avatarProvider: true, avatarStorageKey: true }
	});

	const previousKey = existing
		? resolveExistingAvatarKey(
				(existing.avatarProvider ?? 'local') as StorageProvider,
				existing.avatarStorageKey ?? null,
				existing.avatarPath ?? null
			)
		: null;
	const previousProvider = existing?.avatarProvider ?? null;

	await db
		.update(schema.users)
		.set({
			avatarPath: filename,
			avatarProvider: 'immich',
			avatarStorageKey: key
		})
		.where(eq(schema.users.id, userId));

	// Clean up the prior avatar after the DB now points at the new one. Best
	// effort: never throw if cleanup fails — the new avatar is already live.
	if (previousKey && previousProvider !== 'immich') {
		try {
			await getStorage(previousProvider as StorageProvider).delete(previousKey);
		} catch (err) {
			console.warn('[avatar/from-immich] failed to delete previous avatar:', err);
		}
	}
	if (previousProvider === 'local') {
		const local = getStorage('local');
		for (const legacyExt of AVATAR_LEGACY_EXTS) {
			try {
				await local.delete(avatarLegacyKey(entityId, legacyExt));
			} catch {
				// ignore — best effort sweep
			}
		}
	}

	return json({ avatarPath: filename, url: `/api/users/${userId}/avatar` });
};
