<script lang="ts">
	import type { Snippet } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { X, NotebookPen } from '@lucide/svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { activityDisplayIcon, activityDisplayLabel } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';
	import type { UserRef } from '$lib/types';

	// The shared shape every activity-detail surface renders: icon/label with
	// subtypes, logged time + byline, optional duration, markdown notes.
	interface ActivityDetailEvent {
		type: string;
		subtypes: string[] | null;
		notes: string | null;
		durationMinutes: number | null;
		loggedAt: Date | string;
		logger: UserRef;
	}

	let {
		event,
		onclose,
		journalHref = null,
		footer
	}: {
		event: ActivityDetailEvent;
		onclose: () => void;
		/** When set, renders the built-in "Open Journal" link footer. */
		journalHref?: string | null;
		/** Custom footer (e.g. an inline Edit action); overrides journalHref. */
		footer?: Snippet;
	} = $props();

	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);

	// The modal only mounts while open (parents gate with {#if}), so focusing on
	// mount matches the previous `await tick(); dialogEl?.focus()` behavior.
	$effect(() => {
		dialogEl?.focus();
	});

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		const focusable = Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => !el.hasAttribute('disabled'));
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.key === 'Tab') {
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first.focus();
				}
			}
		}
	}
</script>

<svelte:window onkeydown={handleWindowKey} />

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
	<button
		tabindex="-1"
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		aria-label={t(locale, 'page.dashboard.closeDialog')}
		onclick={onclose}
	></button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		onkeydown={trapFocus}
		class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
			animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
	>
		<div class="flex items-center justify-between px-5 pt-5 pb-3">
			<h2 class="font-semibold text-base text-foreground">
				{activityDisplayIcon(event.type, event.subtypes)}
				{activityDisplayLabel(locale, event.type, event.subtypes)}
			</h2>
			<button
				onclick={onclose}
				aria-label={t(locale, 'common.close')}
				class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<Separator />

		<div class="px-5 py-4 space-y-3 text-sm">
			<div class="flex items-center gap-3">
				<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
					>{t(locale, 'page.dashboard.modalLabelType')}</span
				>
				<Badge variant="gold">{activityDisplayLabel(locale, event.type, event.subtypes)}</Badge>
			</div>
			<div class="flex items-center gap-3">
				<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
					>{t(locale, 'page.dashboard.modalLabelLogged')}</span
				>
				<span class="text-foreground"
					><LocalTime date={event.loggedAt} format="datetime" /><ByLine
						user={event.logger}
						variant="inline"
					/></span
				>
			</div>
			{#if event.durationMinutes}
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.modalLabelDuration')}</span
					>
					<span class="text-foreground">{event.durationMinutes} min</span>
				</div>
			{/if}
			{#if event.notes}
				<div class="pt-1">
					<p class="text-xs font-medium text-muted-foreground mb-1">
						{t(locale, 'page.dashboard.modalLabelNotes')}
					</p>
					<div class="prose prose-sm dark:prose-invert max-w-none">
						{@html renderMarkdown(event.notes)}
					</div>
				</div>
			{/if}
		</div>

		{#if footer}
			<Separator />
			<div class="flex gap-2 px-5 py-4">
				{@render footer()}
			</div>
		{:else if journalHref}
			<Separator />
			<div class="flex gap-2 px-5 py-4">
				<Button href={journalHref} variant="soft" size="sm" onclick={onclose}>
					<NotebookPen class="h-3.5 w-3.5 mr-1.5" />
					{t(locale, 'page.dashboard.modalOpenJournal')}
				</Button>
			</div>
		{/if}
	</div>
</div>
