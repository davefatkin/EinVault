<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import type { UserRef } from '$lib/types';

	let {
		user,
		variant = 'block',
		class: className = ''
	}: { user: UserRef | undefined; variant?: 'inline' | 'block'; class?: string } = $props();
	const locale = getLocale();
</script>

{#if user}
	{#if variant === 'inline'}
		<span class="text-muted-foreground text-xs ml-1 {className}"
			>{t(locale, 'common.loggedBy', { name: user.displayName })}</span
		>
	{:else}
		<p class="text-xs text-muted-foreground opacity-60 {className}">
			{t(locale, 'common.loggedBy', { name: user.displayName })}
		</p>
	{/if}
{/if}
