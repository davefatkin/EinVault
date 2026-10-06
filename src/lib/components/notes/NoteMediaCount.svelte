<script lang="ts">
	import { Images } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	let { count, class: className = '' }: { count: number; class?: string } = $props();
	const locale = getLocale();
	const label = $derived(t(locale, 'page.notes.mediaCount', { count }));
</script>

{#if count > 0}
	<span
		data-testid="note-media-count"
		role="img"
		class="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground {className}"
		aria-label={label}
		title={label}
	>
		<Images class="size-3.5" aria-hidden="true" />
		{count}
	</span>
{/if}
