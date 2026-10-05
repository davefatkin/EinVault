<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import type { UserRef } from '$lib/types';
	import { cn } from '$lib/utils';

	let {
		user,
		updater = null,
		variant = 'block',
		class: className = ''
	}: {
		user: UserRef | undefined;
		// Last editor. Pass it only when it differs from `user`.
		updater?: UserRef | undefined;
		variant?: 'inline' | 'block';
		class?: string;
	} = $props();
	const locale = getLocale();

	const text = $derived(
		[
			user ? t(locale, 'common.loggedBy', { name: user.displayName }) : null,
			updater ? t(locale, 'common.updatedBy', { name: updater.displayName }) : null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

{#if text}
	{#if variant === 'inline'}
		<span class={cn('text-muted-foreground text-xs ml-1', className)}>{text}</span>
	{:else}
		<p class={cn('text-xs text-muted-foreground opacity-60', className)}>{text}</p>
	{/if}
{/if}
