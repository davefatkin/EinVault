import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { getStorage, STORAGE_BACKEND } from '$lib/server/storage';
import {
	AVATAR_LEGACY_EXTS,
	avatarLegacyKey,
	resolveExistingAvatarKey
} from '$lib/server/storage/avatarKeys';
import { isAllowedAvatarMime } from '$lib/server/storage/mime';
import { assertCanEditCompanion } from '$lib/server/permissions';
import { UPLOAD_MAX_MB } from '$lib/server/env';

const MAX_SIZE = UPLOAD_MAX_MB * 1024 * 1024;

export const POST: RequestHandler = async ({ request, params, locals }) => {
	await assertCanEditCompanion(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const formData = await request.formData();
	const file = formData.get('avatar') as File | null;

	if (!file || file.size === 0) error(400, t(locals.locale, 'error.noFileProvided'));
	if (file.size > MAX_SIZE)
		error(400, t(locals.locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));
	if (!isAllowedAvatarMime(file.type)) error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));

	const raw = Buffer.from(await file.arrayBuffer());
	const processed = await sharp(raw)
		.resize(512, 512, { fit: 'cover', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	const filename = `${params.companionId}.jpg`;
	const key = avatarLegacyKey(params.companionId, 'jpg');

	// Snapshot the prior avatar before any writes. We write the new blob and
	// update the DB first; only then do we delete what was there, so a
	// mid-flight failure leaves the old avatar live instead of broken.
	const previousKey = resolveExistingAvatarKey(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath
	);
	const previousProvider = companion.avatarProvider;

	await getStorage().put({
		key,
		body: processed,
		contentType: 'image/jpeg'
	});

	await db
		.update(schema.companions)
		.set({
			avatarPath: filename,
			avatarProvider: STORAGE_BACKEND,
			avatarStorageKey: key
		})
		.where(eq(schema.companions.id, params.companionId));

	// Best-effort cleanup of the prior avatar. Skip when the previous key is
	// identical to the new one (same backend writing avatars/{cid}.jpg again —
	// the put above just overwrote it). Never deletes from Immich.
	if (previousKey && previousKey !== key && previousProvider !== 'immich') {
		try {
			await getStorage(previousProvider).delete(previousKey);
		} catch (err) {
			console.warn('[avatar] failed to delete previous avatar:', err);
		}
	}
	if (previousProvider === 'local') {
		const local = getStorage('local');
		for (const ext of AVATAR_LEGACY_EXTS) {
			const legacy = avatarLegacyKey(params.companionId, ext);
			if (legacy === key) continue;
			try {
				await local.delete(legacy);
			} catch {
				// ignore — best effort sweep
			}
		}
	}

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await assertCanEditCompanion(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const previousKey = resolveExistingAvatarKey(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath
	);
	const previousProvider = companion.avatarProvider;

	// DB first so a delete failure leaves the user with the old avatar still
	// referenced (which they can re-delete) rather than orphaned bytes.
	await db
		.update(schema.companions)
		.set({ avatarPath: null, avatarStorageKey: null, avatarProvider: 'local' })
		.where(eq(schema.companions.id, params.companionId));

	if (previousKey && previousProvider !== 'immich') {
		try {
			await getStorage(previousProvider).delete(previousKey);
		} catch (err) {
			console.warn('[avatar] failed to delete avatar bytes:', err);
		}
	}
	if (previousProvider === 'local') {
		const local = getStorage('local');
		for (const ext of AVATAR_LEGACY_EXTS) {
			try {
				await local.delete(avatarLegacyKey(params.companionId, ext));
			} catch {
				// ignore
			}
		}
	}

	return json({ success: true });
};
