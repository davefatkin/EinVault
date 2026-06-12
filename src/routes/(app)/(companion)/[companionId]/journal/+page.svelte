<script lang="ts">
	import type { PageData } from './$types';
	import { renderMarkdown } from '$lib/markdown';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { X, Pencil, NotebookPen, ArrowRight } from '@lucide/svelte';
	import JournalTimelineEntry from '$lib/components/journal/JournalTimelineEntry.svelte';
	import { tick } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import { ACTIVITY_ICONS } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();

	let { data }: { data: PageData } = $props();

	type Entry = (typeof data.entries)[0];

	let companion = $derived(data.companion);
	let entries = $state<Entry[]>([]);
	let hasMore = $state(false);
	let oldestDate = $state<string | null>(null);
	let loadingMore = $state(false);

	$effect(() => {
		entries = [...data.entries];
		hasMore = data.hasMore;
		oldestDate = data.oldestDate;
	});

	async function loadMore() {
		if (!oldestDate || loadingMore) return;
		loadingMore = true;
		try {
			const res = await fetch(
				`/api/companions/${companion.id}/journal/entries?before=${oldestDate}`
			);
			if (res.ok) {
				const { entries: more, hasMore: moreHasMore, oldestDate: newOldest } = await res.json();
				entries = [...entries, ...more];
				hasMore = moreHasMore;
				oldestDate = newOldest;
			}
		} finally {
			loadingMore = false;
		}
	}

	function formatMonth(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		});
	}

	function monthKey(date: string) {
		return date.slice(0, 7);
	}

	// Lightbox state (bound to MediaLightbox)
	let lightboxOpen = $state(false);
	let lightboxItems = $state<Entry['photos']>([]);
	let lightboxDate = $state('');
	let lightboxIndex = $state(0);

	function openLightbox(items: Entry['photos'], date: string, index: number) {
		lightboxItems = items;
		lightboxDate = date;
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function handleEscapeForDetail(e: KeyboardEvent) {
		if (e.key === 'Escape' && !lightboxOpen && detailEvent) {
			closeDetail();
		}
	}

	// Activity detail modal
	type EventItem = Entry['events'][0];
	let detailEvent = $state<EventItem | null>(null);
	let detailDialogEl = $state<HTMLElement | null>(null);

	async function openDetail(event: EventItem) {
		detailEvent = event;
		await tick();
		detailDialogEl?.focus();
	}

	function closeDetail() {
		detailEvent = null;
	}

	function trapFocus(e: KeyboardEvent) {
		if (!detailDialogEl) return;
		const focusable = Array.from(
			detailDialogEl.querySelectorAll<HTMLElement>(
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

<svelte:head>
	<title>{t(locale, 'page.journal.title')} | {companion.name} | EinVault</title>
</svelte:head>

<svelte:window onkeydown={handleEscapeForDetail} />

<!-- Lightbox -->
<MediaLightbox
	companionId={companion.id}
	items={lightboxItems}
	date={lightboxDate}
	bind:open={lightboxOpen}
	bind:index={lightboxIndex}
/>

<!-- Activity detail modal -->
{#if detailEvent}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'aria.closeDialog')}
			onclick={closeDetail}
		></button>
		<div
			bind:this={detailDialogEl}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={trapFocus}
			class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
				animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
		>
			<div class="flex items-center justify-between px-5 pt-5 pb-3">
				<h2 class="font-semibold text-base text-foreground">
					{ACTIVITY_ICONS[detailEvent.type] ?? '📝'}
					{detailEvent.type.charAt(0).toUpperCase() + detailEvent.type.slice(1)}
				</h2>
				<button
					onclick={closeDetail}
					aria-label={t(locale, 'aria.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.journal.activityDetailType')}</span
					>
					<Badge variant="secondary" class="capitalize">{detailEvent.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.journal.activityDetailLogged')}</span
					>
					<span class="text-foreground"
						><LocalTime date={detailEvent.loggedAt} format="datetime" /><ByLine
							user={detailEvent.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if detailEvent.durationMinutes}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.journal.activityDetailDuration')}</span
						>
						<span class="text-foreground">{detailEvent.durationMinutes} min</span>
					</div>
				{/if}
				{#if detailEvent.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.journal.activityDetailNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(detailEvent.notes)}
						</div>
					</div>
				{/if}
			</div>

			{#if companion.isActive !== false}
				<Separator />
				<div class="flex gap-2 px-5 py-4">
					<Button
						href="/{companion.id}/journal/{new Date(detailEvent.loggedAt)
							.toISOString()
							.slice(0, 10)}"
						variant="soft"
						size="sm"
					>
						<Pencil class="h-3.5 w-3.5 mr-1.5" />
						{t(locale, 'page.journal.activityDetailOpenInJournal')}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="space-y-6 pb-24 md:pb-0 mx-auto max-w-3xl">
	{#if !companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.journal.archivedNotice', { name: companion.name })}
		</div>
	{/if}

	<!-- Header -->
	<div class="flex items-center justify-between">
		<h1 class="font-display text-2xl font-bold text-foreground">
			{t(locale, 'page.journal.title')}
		</h1>
		{#if companion.isActive !== false}
			<Button href="/{companion.id}/journal/{data.today}" size="sm">
				{t(locale, 'page.journal.todayEntry')}
				<ArrowRight class="h-4 w-4 ml-1" />
			</Button>
		{/if}
	</div>

	{#if entries.length === 0}
		<div class="rounded-xl border bg-card text-center py-12 px-6">
			<NotebookPen class="h-10 w-10 mb-3 mx-auto text-muted-foreground" />
			<p class="font-medium mb-1 text-foreground">{t(locale, 'page.journal.emptyTitle')}</p>
			<p class="text-sm mb-4 text-muted-foreground">
				{t(locale, 'page.journal.emptyBody', { name: companion.name })}
			</p>
			{#if companion.isActive !== false}
				<Button href="/{companion.id}/journal/{data.today}"
					>{t(locale, 'page.journal.writeFirstEntry')}</Button
				>
			{/if}
		</div>
	{:else}
		{@const grouped = entries.reduce<{ month: string; items: Entry[] }[]>((acc, entry) => {
			const mk = monthKey(entry.date);
			if (!acc.length || acc[acc.length - 1].month !== mk) acc.push({ month: mk, items: [] });
			acc[acc.length - 1].items.push(entry);
			return acc;
		}, [])}

		{#each grouped as group (group.month)}
			<!-- Month header -->
			<div class="flex items-center gap-3">
				<span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{formatMonth(group.month + '-01')}
				</span>
				<Separator class="flex-1" />
			</div>

			<div class="space-y-3">
				{#each group.items as entry (entry.date)}
					<JournalTimelineEntry
						{entry}
						companionId={companion.id}
						today={data.today}
						canEdit={companion.isActive !== false}
						onOpenLightbox={openLightbox}
						onOpenActivity={openDetail}
					/>
				{/each}
			</div>
		{/each}

		{#if hasMore}
			<div class="flex justify-center pt-2">
				<Button variant="secondary" onclick={loadMore} disabled={loadingMore}>
					{loadingMore ? t(locale, 'common.loading') : t(locale, 'page.journal.loadOlderEntries')}
				</Button>
			</div>
		{/if}
	{/if}
</div>
