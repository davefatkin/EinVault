<script lang="ts">
	import type { PageData } from './$types';
	import { tick, onDestroy } from 'svelte';
	import { snapshot } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { NotebookPen, ArrowRight } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import JournalTimelineEntry from '#lib/components/journal/JournalTimelineEntry.svelte';
	import MediaLightbox from '#lib/components/MediaLightbox.svelte';
	import ActivityDetailModal from '#lib/components/log/ActivityDetailModal.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { toSpecies } from '#lib/species.js';
	import DocumentPreview from '#lib/components/DocumentPreview.svelte';
	import { journalMediaUrl, type MediaItem } from '#lib/media.js';
	import HealthDetailModal from '#lib/components/health/HealthDetailModal.svelte';
	import {
		documentUrl,
		healthRecordHref,
		type DayItemDocument,
		type DayRecordItem
	} from '#lib/dayItems.js';

	const locale = getLocale();

	let { data }: { data: PageData } = $props();

	type Entry = (typeof data.entries)[0];

	let companion = $derived(data.companion);
	let species = $derived(toSpecies(companion.species));
	let entries = $state<Entry[]>([]);
	let hasMore = $state(false);
	let oldestDate = $state<string | null>(null);
	let loadingMore = $state(false);

	$effect(() => {
		entries = [...data.entries];
		hasMore = data.hasMore;
		oldestDate = data.oldestDate;
	});

	// Back from a health or weight detail re-runs the load, which resets the list
	// to the first page. The snapshot stores only how far back the list had been
	// loaded and the scroll position, never the entries themselves: restoring
	// stored entries would overwrite fresh data (edited days, changed records)
	// with stale copies. Instead restore refetches older pages until that day is
	// reached again, then scrolls. SvelteKit scrolls before it restores snapshots,
	// while the DOM still holds only the first page, so the scroll has to happen
	// here once the older days are rendered.
	let destroyed = false;
	onDestroy(() => (destroyed = true));

	async function restoreLoaded(value: { oldestDate: string | null; scrollY: number }) {
		const target = value.oldestDate;
		if (!target || !oldestDate || oldestDate <= target) return;
		// Bail out if the user left the page while older days were loading.
		while (!destroyed && hasMore && oldestDate && oldestDate > target) {
			const before: string = oldestDate;
			await loadMore();
			if (oldestDate === before) break;
		}
		await tick();
		if (destroyed) return;
		window.scrollTo(0, value.scrollY);
	}

	snapshot({
		id: 'journal-timeline',
		capture: (): { oldestDate: string | null; scrollY: number } => ({
			oldestDate,
			scrollY: window.scrollY
		}),
		restore: (value) => {
			void restoreLoaded(value);
		}
	});

	let previewDoc = $state<DayItemDocument | null>(null);
	let detailRecord = $state<DayRecordItem | null>(null);

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
	let lightboxItems = $state<MediaItem[]>([]);
	let lightboxDate = $state('');
	let lightboxIndex = $state(0);

	function openLightbox(items: MediaItem[], date: string, index: number) {
		lightboxItems = items;
		lightboxDate = date;
		lightboxIndex = index;
		lightboxOpen = true;
	}

	// Activity detail modal (shared component owns focus/escape/backdrop).
	type EventItem = Entry['events'][0];
	let detailEvent = $state<EventItem | null>(null);

	// The timeline day the activity is filed under (server-local), for the
	// modal's journal link. Converting loggedAt in the browser would use the
	// browser's timezone instead.
	let detailDate = $state('');

	function openDetail(event: EventItem, date: string) {
		detailEvent = event;
		detailDate = date;
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
	items={lightboxItems}
	urlFor={(item) => journalMediaUrl(companion.id, lightboxDate, item)}
	bind:open={lightboxOpen}
	bind:index={lightboxIndex}
/>

<!-- Activity detail modal -->
{#if detailEvent}
	<ActivityDetailModal
		event={detailEvent}
		onclose={closeDetail}
		journalHref={companion.isActive !== false ? `/${companion.id}/journal/${detailDate}` : null}
		{species}
	/>
{/if}

{#if previewDoc}
	<DocumentPreview
		open={true}
		url={documentUrl(companion.id, previewDoc.filename)}
		mimeType={previewDoc.mimeType}
		title={previewDoc.title}
		onclose={() => (previewDoc = null)}
	/>
{/if}

{#if detailRecord}
	<HealthDetailModal
		detail={detailRecord}
		documents={detailRecord.kind === 'health' ? detailRecord.documents : []}
		onclose={() => (detailRecord = null)}
		onPreviewDocument={(doc) => (previewDoc = doc)}
		healthHref={healthRecordHref(companion.id, detailRecord)}
		journalHref={(d) => `/${companion.id}/journal/${d}`}
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
						onOpenRecord={(item) => (detailRecord = item)}
						onPreviewDocument={(doc) => (previewDoc = doc)}
						{species}
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
