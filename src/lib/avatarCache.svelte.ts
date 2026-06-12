export const avatarCacheBusts = $state<Record<string, number>>({});

export function bustAvatarCache(companionId: string) {
	avatarCacheBusts[companionId] = Date.now();
}

export const userAvatarCacheBusts = $state<Record<string, number>>({});

export function bustUserAvatarCache(userId: string) {
	userAvatarCacheBusts[userId] = Date.now();
}
