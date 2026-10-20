<script lang="ts">
	import type { Snippet } from 'svelte';
	import { X } from '@lucide/svelte';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { trapTab } from '#lib/focusTrap.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Dialog shell for a form opened in place. Parents mount it only while
	// open. `locked` keeps Escape, the backdrop and the X from closing it
	// while a save runs.
	let {
		title,
		onclose,
		locked = false,
		children
	}: { title: string; onclose: () => void; locked?: boolean; children: Snippet } = $props();
	const locale = getLocale();
	const titleId = `modal-title-${Math.random().toString(36).slice(2)}`;
	let dialogEl = $state<HTMLElement | null>(null);

	$effect(() => {
		const trigger = document.activeElement as HTMLElement | null;
		dialogEl?.querySelector<HTMLElement>('input, select, textarea')?.focus();
		return () => trigger?.focus();
	});

	function close() {
		if (!locked) onclose();
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
	<button
		tabindex="-1"
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		aria-label={t(locale, 'aria.closeDialog')}
		onclick={close}
	></button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby={titleId}
		tabindex="-1"
		onkeydown={(e) => dialogEl && trapTab(dialogEl, e)}
		class="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
			animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
	>
		<div class="flex items-center justify-between px-5 pt-5 pb-3">
			<h2 id={titleId} class="font-semibold text-base text-foreground">{title}</h2>
			<button
				onclick={close}
				disabled={locked}
				aria-label={t(locale, 'aria.close')}
				class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
			>
				<X class="h-4 w-4" />
			</button>
		</div>
		<Separator />
		<div class="overflow-y-auto px-5 py-4">{@render children()}</div>
	</div>
</div>
