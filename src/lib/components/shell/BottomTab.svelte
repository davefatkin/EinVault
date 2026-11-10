<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		href?: string;
		label: string;
		icon: Component;
		active?: boolean;
		locked?: boolean;
		lockedNote?: string;
		onclick?: () => void;
		expanded?: boolean;
		haspopup?: 'dialog';
		/** Button tabs only: visually hidden text announced while active. */
		currentNote?: string;
		id?: string;
	}

	let {
		href,
		label,
		icon: Icon,
		active = false,
		locked = false,
		lockedNote,
		onclick,
		expanded,
		haspopup,
		currentNote,
		id
	}: Props = $props();

	const base =
		'flex flex-1 flex-col items-center justify-end gap-0.5 py-2 pb-2 min-h-[56px] min-w-0 whitespace-nowrap text-[10px] font-medium transition-colors';
	let tone = $derived(active ? 'text-primary' : 'text-muted-foreground');
</script>

<!-- The label span is capped at the slot width so a label that does not fit
     overflows measurably (scrollWidth > clientWidth) instead of silently
     widening the tab. -->
{#if locked}
	<span class="{base} opacity-40 cursor-not-allowed text-muted-foreground">
		<Icon class="h-5 w-5 mb-0.5" aria-hidden="true" />
		<span class="max-w-full" data-tab-label>{label}</span>
		{#if lockedNote}<span class="sr-only">({lockedNote})</span>{/if}
	</span>
{:else if href}
	<a {href} {id} aria-current={active ? 'page' : undefined} class="{base} {tone}">
		<Icon class="h-5 w-5 mb-0.5" />
		<span class="max-w-full" data-tab-label>{label}</span>
	</a>
{:else}
	<button
		type="button"
		{id}
		{onclick}
		aria-expanded={expanded}
		aria-haspopup={haspopup}
		class="{base} {active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}"
	>
		<Icon class="h-5 w-5 mb-0.5" />
		<span class="max-w-full" data-tab-label>{label}</span>
		{#if active && currentNote}<span class="sr-only">({currentNote})</span>{/if}
	</button>
{/if}
