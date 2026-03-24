export const avatarCacheBusts = $state<Record<string, number>>({});

export function bustAvatarCache(companionId: string) {
	avatarCacheBusts[companionId] = Date.now();
}
