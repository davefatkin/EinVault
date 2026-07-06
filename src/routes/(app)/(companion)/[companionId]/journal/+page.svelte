<script lang="ts">
	import type { PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { NotebookPen, ArrowRight } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import JournalTimelineEntry from '$lib/components/journal/JournalTimelineEntry.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import ActivityDetailModal from '$lib/components/log/ActivityDetailModal.svelte';
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

	// Activity detail modal (shared component owns focus/escape/backdrop).
	type EventItem = Entry['events'][0];
	let detailEvent = $state<EventItem | null>(null);

	function openDetail(event: EventItem) {
		detailEvent = event;
	}

	function closeDetail() {
		detailEvent = null;
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.journal.title')} | {companion.name} | EinVault</title>
</svelte:head>

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
	<ActivityDetailModal
		event={detailEvent}
		onclose={closeDetail}
		journalHref={companion.isActive !== false
			? `/${companion.id}/journal/${new Date(detailEvent.loggedAt).toISOString().slice(0, 10)}`
			: null}
	/>
{/if}

<div class="max-w-3xl mx-auto space-y-6 pb-24 md:pb-0">
	{#if !companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.journal.archivedNotice', { name: companion.name })}
		</div>
	{/if}

	<!-- Header -->
	<PageHeader title={t(locale, 'page.journal.title')} tint="gold">
		{#snippet icon()}<NotebookPen class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			{#if companion.isActive !== false}
				<Button href="/{companion.id}/journal/{data.today}" size="sm">
					{t(locale, 'page.journal.todayEntry')}
					<ArrowRight class="h-4 w-4 ml-1" />
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if entries.length === 0}
		<div class="rounded-xl border bg-card">
			<EmptyState
				tint="gold"
				title={t(locale, 'page.journal.emptyTitle')}
				body={t(locale, 'page.journal.emptyBody', { name: companion.name })}
			>
				{#snippet icon()}<NotebookPen class="h-5 w-5" />{/snippet}
				{#snippet action()}
					{#if companion.isActive !== false}
						<Button href="/{companion.id}/journal/{data.today}"
							>{t(locale, 'page.journal.writeFirstEntry')}</Button
						>
					{/if}
				{/snippet}
			</EmptyState>
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
