<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Trash2, Activity, X, NotebookPen } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activityDisplayIcon, activityDisplayLabel } from '$lib/i18n/labels';
	import { renderMarkdown, stripMarkdown } from '$lib/markdown';

	interface TodayEvent {
		id: string;
		type: string;
		subtypes: string[] | null;
		notes: string | null;
		durationMinutes: number | null;
		loggedAt: Date;
		loggedBy: string | null;
		logger: { displayName: string } | null;
	}

	let {
		events,
		currentUserId,
		deleteAction = '?/delete',
		canDelete = (event: TodayEvent) => event.loggedBy === currentUserId,
		journalHrefBase = null
	}: {
		events: TodayEvent[];
		currentUserId: string | undefined;
		deleteAction?: string;
		canDelete?: (event: TodayEvent) => boolean;
		journalHrefBase?: string | null;
	} = $props();

	const locale = getLocale();

	// Detail modal, mirrors the companion dashboard's activity modal
	// (src/routes/(app)/(companion)/[companionId]/+page.svelte).
	let selected = $state<TodayEvent | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	function eventDate(d: Date | string): string {
		return new Date(d).toISOString().slice(0, 10);
	}

	async function openDetail(event: TodayEvent) {
		selected = event;
		await tick();
		dialogEl?.focus();
	}

	function closeDetail() {
		selected = null;
	}

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && selected) {
			closeDetail();
		}
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

{#if selected}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'page.dashboard.closeDialog')}
			onclick={closeDetail}
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
					{activityDisplayIcon(selected.type, selected.subtypes)}
					{activityDisplayLabel(locale, selected.type, selected.subtypes)}
				</h2>
				<button
					onclick={closeDetail}
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
					<Badge variant="gold"
						>{activityDisplayLabel(locale, selected.type, selected.subtypes)}</Badge
					>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.modalLabelLogged')}</span
					>
					<span class="text-foreground"
						><LocalTime date={selected.loggedAt} format="datetime" /><ByLine
							user={selected.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if selected.durationMinutes}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelDuration')}</span
						>
						<span class="text-foreground">{selected.durationMinutes} min</span>
					</div>
				{/if}
				{#if selected.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.dashboard.modalLabelNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(selected.notes)}
						</div>
					</div>
				{/if}
			</div>

			{#if journalHrefBase}
				<Separator />
				<div class="flex gap-2 px-5 py-4">
					<Button
						href="{journalHrefBase}/{eventDate(selected.loggedAt)}"
						variant="soft"
						size="sm"
						onclick={closeDetail}
					>
						<NotebookPen class="h-3.5 w-3.5 mr-1.5" />
						{t(locale, 'page.dashboard.modalOpenJournal')}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}

{#if events.length === 0}
	<EmptyState size="sm" tint="gold" title={t(locale, 'page.log.nothingLoggedYet')}>
		{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
	</EmptyState>
{:else}
	<div class="space-y-1">
		{#each events as event (event.id)}
			<div class="flex items-center gap-2 py-1 border-b last:border-0">
				<button
					type="button"
					onclick={() => openDetail(event)}
					class="flex-1 min-w-0 flex items-center gap-3 rounded-md px-2 py-2 -ml-2 hover:bg-accent transition-colors text-left"
				>
					<span
						class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg"
						>{activityDisplayIcon(event.type, event.subtypes)}</span
					>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2">
							<Badge variant="gold"
								>{activityDisplayLabel(locale, event.type, event.subtypes)}</Badge
							>
							{#if event.durationMinutes}
								<span class="text-xs text-muted-foreground">{event.durationMinutes} min</span>
							{/if}
						</div>
						{#if event.notes}
							<p class="text-sm truncate text-muted-foreground mt-0.5">
								{stripMarkdown(event.notes)}
							</p>
						{/if}
						<div class="flex items-center gap-1 mt-0.5">
							<span class="text-xs text-muted-foreground">
								<LocalTime date={event.loggedAt} format="time" />
							</span>
							{#if event.logger}
								<ByLine user={event.logger} variant="inline" />
							{/if}
						</div>
					</div>
				</button>
				{#if canDelete(event)}
					<form
						method="POST"
						action={deleteAction}
						use:enhance={() =>
							async ({ update }) => {
								await update({ reset: false });
							}}
					>
						<input type="hidden" name="id" value={event.id} />
						<Button
							type="submit"
							variant="ghost"
							size="sm"
							class="h-7 w-7 p-0 text-muted-foreground hover:text-coral"
							aria-label={t(locale, 'aria.deleteEntry')}
						>
							<Trash2 class="h-3.5 w-3.5" />
						</Button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
{/if}
