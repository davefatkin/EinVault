<script lang="ts">
	import { Images } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	let { count, class: className = '' }: { count: number; class?: string } = $props();
	const locale = getLocale();
	const label = $derived(t(locale, 'page.notes.mediaCount', { count }));
</script>

{#if count > 0}
	<span class="inline-flex items-center text-xs font-normal text-muted-foreground {className}">
		<!-- Visual icon and number with a hover tooltip; screen readers get the sr-only label instead. -->
		<span
			data-testid="note-media-count"
			class="inline-flex items-center gap-1"
			title={label}
			aria-hidden="true"
		>
			<Images class="size-3.5" />
			{count}
		</span>
		<span class="sr-only">{label}</span>
	</span>
{/if}
