<script lang="ts">
	import { t, getLocale } from '$lib/i18n';

	type Logger = { displayName: string } | null | undefined;

	let {
		logger,
		variant = 'block',
		class: className = ''
	}: { logger: Logger; variant?: 'inline' | 'block'; class?: string } = $props();
	const locale = getLocale();
</script>

{#if logger}
	{#if variant === 'inline'}
		<span class="text-muted-foreground text-xs ml-1 {className}"
			>{t(locale, 'common.loggedBy', { name: logger.displayName })}</span
		>
	{:else}
		<p class="text-xs text-muted-foreground opacity-60 {className}">
			{t(locale, 'common.loggedBy', { name: logger.displayName })}
		</p>
	{/if}
{/if}
