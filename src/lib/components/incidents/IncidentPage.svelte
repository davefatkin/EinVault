<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import { ChevronLeft } from '@lucide/svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import IncidentDetail from './IncidentDetail.svelte';
	import { cn } from '#lib/utils.js';

	// Shell shared by the owner and caretaker incident pages: back link, a
	// print-only "whose incident" line, optional notice, form error, detail.
	let {
		backHref,
		backLabel,
		printLabel,
		notice,
		error = null,
		class: className = '',
		detail
	}: {
		backHref: string;
		backLabel: string;
		printLabel: string;
		notice?: Snippet;
		error?: string | null;
		class?: string;
		detail: ComponentProps<typeof IncidentDetail>;
	} = $props();
</script>

<div class={cn('mx-auto max-w-3xl space-y-4', className)}>
	<a
		href={backHref}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
	>
		<ChevronLeft class="h-4 w-4" />
		{backLabel}
	</a>
	<!-- A printout needs to say whose incident it is. -->
	<p class="hidden text-sm font-medium print:block">{printLabel}</p>
	{@render notice?.()}
	{#if error}
		<Alert variant="coral" class="print:hidden"><AlertDescription>{error}</AlertDescription></Alert>
	{/if}
	{#key detail.data.incident.id}
		<IncidentDetail {...detail} />
	{/key}
</div>
