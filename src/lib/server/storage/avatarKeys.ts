import type { StorageProvider } from './types';

export const AVATAR_LEGACY_EXTS = ['jpg', 'png', 'webp'] as const;

export function avatarLegacyKey(companionId: string, ext: string): string {
	return `avatars/${companionId}.${ext}`;
}

// Map a companion row's avatar columns to the storage key currently in use.
// Returns null when the companion has no avatar set.
export function resolveExistingAvatarKey(
	provider: StorageProvider,
	storedKey: string | null,
	avatarPath: string | null
): string | null {
	if (storedKey) return storedKey;
	if (provider === 'local' && avatarPath) return `avatars/${avatarPath}`;
	return null;
}
