<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { PageTint } from '$lib/pageIdentity';
	import { pageIconClass } from '$lib/pageIdentity';

	let {
		title,
		subtitle,
		tint = 'muted',
		icon,
		actions
	}: {
		title: string;
		subtitle?: string;
		tint?: PageTint;
		icon: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-center gap-3">
	<div class="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 {pageIconClass(tint)}">
		{@render icon()}
	</div>
	<!-- flex-auto (not flex-1): a 0% flex-basis would let the actions stay on
	     the row while the title overflows over them; with basis auto the row
	     wraps when title + actions don't fit. -->
	<div class="min-w-0 flex-auto">
		<h1 class="font-display text-2xl font-bold text-foreground">{title}</h1>
		{#if subtitle}
			<p class="text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="ml-auto flex items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
