import { error } from '@sveltejs/kit';
import type { Locale } from '$lib/i18n';
import { t } from '$lib/i18n';
import sharp from 'sharp';
import { getStorage, STORAGE_BACKEND } from '$lib/server/storage';
import {
	AVATAR_LEGACY_EXTS,
	avatarLegacyKey,
	resolveExistingAvatarKey
} from '$lib/server/storage/avatarKeys';
import { isAllowedAvatarMime } from '$lib/server/storage/mime';
import { UPLOAD_MAX_MB, type StorageBackendName } from '$lib/server/env';
import type { StorageProvider } from '$lib/server/storage/types';

const MAX_SIZE = UPLOAD_MAX_MB * 1024 * 1024;

export interface AvatarFields {
	avatarPath: string;
	avatarProvider: StorageBackendName;
	avatarStorageKey: string;
}

/**
 * Validates, resizes, and stores an avatar upload.
 *
 * @param file - The uploaded file from multipart form data.
 * @param key - The storage key to write to (e.g. `avatarLegacyKey(id, 'jpg')`).
 * @param avatarPath - The filename stored in the DB (e.g. `${id}.jpg`).
 * @param locale - Locale for error messages.
 * @returns DB fields to set: avatarPath, avatarProvider, avatarStorageKey.
 */
export async function processAvatarUpload(
	file: File,
	key: string,
	avatarPath: string,
	locale: Locale
): Promise<AvatarFields> {
	if (!file || file.size === 0) error(400, t(locale, 'error.noFileProvided'));
	if (file.size > MAX_SIZE) error(400, t(locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));
	if (!isAllowedAvatarMime(file.type)) error(400, t(locale, 'error.invalidFileTypeAvatar'));

	const raw = Buffer.from(await file.arrayBuffer());
	const processed = await sharp(raw)
		.resize(512, 512, { fit: 'cover', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	try {
		await getStorage().put({
			key,
			body: processed,
			contentType: 'image/jpeg'
		});
	} catch (err) {
		console.error('[avatar] storage put failed:', err);
		error(502, t(locale, 'error.fileNotFound'));
	}

	return {
		avatarPath,
		avatarProvider: STORAGE_BACKEND,
		avatarStorageKey: key
	};
}

/**
 * Best-effort cleanup of a previous avatar. Skips if there was no previous
 * key, if it matches the new key (overwrite in place), or if it is Immich-hosted.
 * Also sweeps legacy-extension variants for local storage.
 *
 * @param prevProvider - The `avatarProvider` column value before the update.
 * @param prevStorageKey - The `avatarStorageKey` column value before the update.
 * @param prevPath - The `avatarPath` column value before the update.
 * @param newKey - The key just written (skip deletion when it matches).
 * @param entityId - The id used to build legacy keys (companion id or `user-{userId}`).
 */
export async function deletePreviousAvatar(
	prevProvider: StorageProvider | string | null | undefined,
	prevStorageKey: string | null | undefined,
	prevPath: string | null | undefined,
	newKey: string,
	entityId: string
): Promise<void> {
	const previousKey = resolveExistingAvatarKey(
		(prevProvider ?? 'local') as StorageProvider,
		prevStorageKey ?? null,
		prevPath ?? null
	);

	if (previousKey && previousKey !== newKey && prevProvider !== 'immich') {
		try {
			await getStorage((prevProvider ?? 'local') as StorageProvider).delete(previousKey);
		} catch (err) {
			console.warn('[avatar] failed to delete previous avatar:', err);
		}
	}

	if (prevProvider === 'local') {
		const local = getStorage('local');
		for (const ext of AVATAR_LEGACY_EXTS) {
			const legacy = avatarLegacyKey(entityId, ext);
			if (legacy === newKey) continue;
			try {
				await local.delete(legacy);
			} catch {
				// ignore — best effort sweep
			}
		}
	}
}

/**
 * Best-effort deletion of an avatar (for DELETE endpoint). Removes the stored
 * blob and sweeps legacy-extension variants for local storage.
 *
 * @param provider - The `avatarProvider` column value.
 * @param storageKey - The `avatarStorageKey` column value.
 * @param avatarPath - The `avatarPath` column value.
 * @param entityId - The id used to build legacy keys (companion id or `user-{userId}`).
 */
export async function deleteAvatar(
	provider: StorageProvider | string | null | undefined,
	storageKey: string | null | undefined,
	avatarPath: string | null | undefined,
	entityId: string
): Promise<void> {
	const key = resolveExistingAvatarKey(
		(provider ?? 'local') as StorageProvider,
		storageKey ?? null,
		avatarPath ?? null
	);

	if (key && provider !== 'immich') {
		try {
			await getStorage((provider ?? 'local') as StorageProvider).delete(key);
		} catch (err) {
			console.warn('[avatar] failed to delete avatar bytes:', err);
		}
	}

	if (provider === 'local') {
		const local = getStorage('local');
		for (const ext of AVATAR_LEGACY_EXTS) {
			try {
				await local.delete(avatarLegacyKey(entityId, ext));
			} catch {
				// ignore
			}
		}
	}
}
