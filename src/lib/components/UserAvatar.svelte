<script lang="ts">
	import { userAvatarCacheBusts } from '$lib/avatarCache.svelte';

	interface Props {
		userId: string;
		displayName: string;
		avatarPath?: string | null;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let {
		userId,
		displayName,
		avatarPath = null,
		size = 'sm',
		class: className = ''
	}: Props = $props();

	const sizes = {
		sm: 'h-7 w-7 text-xs',
		md: 'h-10 w-10 text-base',
		lg: 'h-16 w-16 text-2xl'
	};

	// Same 5 gradient pairs as CompanionAvatar, keyed by userId hash.
	const GRADIENTS = [
		['hsl(var(--primary))', 'hsl(var(--coral))'],
		['hsl(var(--gold))', 'hsl(var(--coral))'],
		['hsl(var(--primary))', 'hsl(var(--teal))'],
		['hsl(var(--coral))', 'hsl(var(--primary))'],
		['hsl(var(--teal))', 'hsl(var(--gold))']
	] as const;

	function gradientIndex(id: string): number {
		let sum = 0;
		for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
		return sum % GRADIENTS.length;
	}

	let avatarGradient = $derived.by(() => {
		const [from, to] = GRADIENTS[gradientIndex(userId)];
		return `linear-gradient(135deg, ${from}, ${to})`;
	});

	let imgError = $state(false);

	// Reset error if avatarPath changes (e.g. after upload in a future step).
	$effect(() => {
		avatarPath;
		imgError = false;
	});

	let showImg = $derived(!!avatarPath && !imgError);

	let imgSrc = $derived(
		showImg
			? `/api/users/${userId}/avatar${userAvatarCacheBusts[userId] ? `?t=${userAvatarCacheBusts[userId]}` : ''}`
			: null
	);
</script>

<div
	class="{sizes[
		size
	]} rounded-full overflow-hidden flex items-center justify-center shrink-0 {className}"
	style={showImg ? undefined : `background: ${avatarGradient}`}
>
	{#if showImg}
		<img
			src={imgSrc}
			alt={displayName}
			class="w-full h-full object-cover"
			onerror={() => (imgError = true)}
		/>
	{:else}
		<span class="font-display font-bold text-white select-none leading-none" aria-hidden="true">
			{displayName.charAt(0).toUpperCase()}
		</span>
	{/if}
</div>
