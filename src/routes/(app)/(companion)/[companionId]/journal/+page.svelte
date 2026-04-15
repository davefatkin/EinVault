<script lang="ts">
	import type { PageData } from './$types';
	import { renderMarkdown } from '$lib/markdown';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import {
		ChevronLeft,
		ChevronRight,
		X,
		Pencil,
		NotebookPen,
		ArrowRight,
		Download
	} from '@lucide/svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { tick } from 'svelte';
	import { MOOD_ICONS, ACTIVITY_ICONS } from '$lib/i18n/labels';
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

	const EVENT_ICONS = ACTIVITY_ICONS;

	function formatDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatMonth(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			month: 'long',
			year: 'numeric'
		});
	}

	function photoUrl(photo: Entry['photos'][0], date: string) {
		return `/api/photos/journal/${companion.id}/${date}/${photo.filename}`;
	}

	function monthKey(date: string) {
		return date.slice(0, 7);
	}

	// Lightbox
	let lightboxPhotos = $state<Entry['photos']>([]);
	let lightboxDate = $state('');
	let lightboxIndex = $state(0);
	let lightboxPhoto = $derived(lightboxPhotos.length > 0 ? lightboxPhotos[lightboxIndex] : null);
	let lightboxEl = $state<HTMLElement | null>(null);
	let lightboxTrigger = $state<HTMLElement | null>(null);

	async function openLightbox(photos: Entry['photos'], date: string, index: number) {
		lightboxTrigger = document.activeElement as HTMLElement | null;
		lightboxPhotos = photos;
		lightboxDate = date;
		lightboxIndex = index;
		await tick();
		lightboxEl?.focus();
	}
	function closeLightbox() {
		lightboxPhotos = [];
		lightboxDate = '';
		lightboxIndex = 0;
		tick().then(() => lightboxTrigger?.focus());
	}
	function lightboxPrev() {
		if (lightboxIndex > 0) lightboxIndex--;
	}
	function lightboxNext() {
		if (lightboxIndex < lightboxPhotos.length - 1) lightboxIndex++;
	}

	function handleLightboxKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (lightboxPhoto) {
				closeLightbox();
				return;
			}
			if (detailEvent) {
				closeDetail();
				return;
			}
		}
		if (!lightboxPhoto) return;
		if (e.key === 'ArrowLeft') lightboxPrev();
		else if (e.key === 'ArrowRight') lightboxNext();
	}

	function trapLightboxFocus(e: KeyboardEvent) {
		if (!lightboxEl || e.key !== 'Tab') return;
		const focusable = Array.from(
			lightboxEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
			)
		);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
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

<svelte:window onkeydown={handleLightboxKey} />

<!-- Lightbox -->
{#if lightboxPhoto}
	<div
		bind:this={lightboxEl}
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'page.journal.photoLightboxLabel')}
		tabindex="-1"
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 focus:outline-none"
		onclick={closeLightbox}
		onkeydown={(e) => {
			handleLightboxKey(e);
			trapLightboxFocus(e);
		}}
	>
		<div
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			class="relative max-w-4xl w-full"
		>
			<div class="flex items-center justify-between mb-2">
				{#if lightboxPhotos.length > 1}
					<span class="text-sm text-white/60">{lightboxIndex + 1} / {lightboxPhotos.length}</span>
				{:else}
					<span></span>
				{/if}
				<div class="flex items-center gap-1">
					<a
						href={photoUrl(lightboxPhoto, lightboxDate)}
						download={lightboxPhoto.originalName ?? lightboxPhoto.filename}
						class="text-white/70 hover:text-white p-1 rounded"
						aria-label={t(locale, 'aria.downloadPhoto')}
					>
						<Download class="h-5 w-5" />
					</a>
					<button
						type="button"
						onclick={closeLightbox}
						class="text-white/70 hover:text-white p-1 rounded"
						aria-label={t(locale, 'aria.close')}
					>
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>

			<div class="relative">
				<img
					src={photoUrl(lightboxPhoto, lightboxDate)}
					alt={lightboxPhoto.originalName ?? ''}
					class="max-h-[78vh] w-full object-contain rounded-lg"
				/>
				{#if lightboxPhotos.length > 1}
					<button
						type="button"
						onclick={lightboxPrev}
						disabled={lightboxIndex === 0}
						class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity bg-black/40 {lightboxIndex ===
						0
							? 'opacity-20 cursor-default'
							: 'opacity-70 hover:opacity-100'}"
						aria-label={t(locale, 'aria.previousPhoto')}
					>
						<ChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						onclick={lightboxNext}
						disabled={lightboxIndex === lightboxPhotos.length - 1}
						class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity bg-black/40 {lightboxIndex ===
						lightboxPhotos.length - 1
							? 'opacity-20 cursor-default'
							: 'opacity-70 hover:opacity-100'}"
						aria-label={t(locale, 'aria.nextPhoto')}
					>
						<ChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>

			{#if lightboxPhoto.notes}
				<div class="prose prose-sm prose-invert max-w-none mt-3 text-center text-sm">
					{@html renderMarkdown(lightboxPhoto.notes)}
				</div>
			{/if}
			{#if lightboxPhoto.logger}
				<div class="mt-2 flex justify-center">
					<ByLine user={lightboxPhoto.logger} variant="inline" class="!text-white/60 !ml-0" />
				</div>
			{/if}
		</div>
	</div>
{/if}

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
					{EVENT_ICONS[detailEvent.type] ?? '📝'}
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
						variant="outline"
						size="sm"
						onclick={closeDetail}
					>
						<Pencil class="h-3.5 w-3.5 mr-1.5" />
						{t(locale, 'page.journal.activityDetailOpenInJournal')}
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="space-y-6 pb-24 md:pb-0">
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
		<Card>
			<CardContent class="text-center py-12">
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
			</CardContent>
		</Card>
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

			{#each group.items as entry (entry.date)}
				<Card class="overflow-hidden">
					<CardHeader class="py-3 px-5">
						<div class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2 min-w-0">
								{#if entry.mood && MOOD_ICONS[entry.mood]}
									<span class="text-xl shrink-0" title={entry.mood}>{MOOD_ICONS[entry.mood]}</span>
								{:else}
									<NotebookPen class="h-5 w-5 shrink-0 opacity-30 text-foreground" />
								{/if}
								<div class="min-w-0">
									<h2 class="font-semibold text-sm leading-snug truncate text-foreground">
										{formatDate(entry.date)}
									</h2>
									{#if entry.date === data.today}
										<span class="text-xs font-medium text-primary"
											>{t(locale, 'page.journal.today')}</span
										>
									{/if}
									<ByLine user={entry.logger} variant="inline" class="ml-0" />
								</div>
							</div>
							{#if companion.isActive !== false}
								<Button
									href="/{companion.id}/journal/{entry.date}"
									variant="ghost"
									size="sm"
									class="h-7 text-xs shrink-0 gap-1"
								>
									<Pencil class="h-3 w-3" />
									{t(locale, 'page.journal.edit')}
								</Button>
							{/if}
						</div>
					</CardHeader>

					<!-- Photos -->
					{#if entry.photos.length > 0}
						<div
							class="grid gap-0.5 {entry.photos.length === 1
								? 'grid-cols-1'
								: entry.photos.length === 2
									? 'grid-cols-2'
									: 'grid-cols-3'}"
						>
							{#each entry.photos as photo, i (photo.id)}
								<button
									type="button"
									onclick={() => openLightbox(entry.photos, entry.date, i)}
									class="block overflow-hidden {entry.photos.length === 1
										? 'aspect-video'
										: 'aspect-square'} hover:opacity-95 transition-opacity"
									title={photo.originalName ?? 'Journal photo'}
								>
									<img
										src={photoUrl(photo, entry.date)}
										alt={photo.originalName ?? ''}
										class="w-full h-full object-cover"
										loading="lazy"
									/>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Markdown body -->
					{#if entry.body?.trim()}
						<CardContent class="py-4">
							<div class="prose prose-sm max-w-none leading-relaxed">
								{@html renderMarkdown(entry.body)}
							</div>
						</CardContent>
					{:else if !entry.photos.length && !entry.events.length}
						<CardContent class="py-4">
							<p class="text-sm italic text-muted-foreground">
								{t(locale, 'page.journal.noNotes')}
							</p>
						</CardContent>
					{/if}

					<!-- Activities -->
					{#if entry.events.length > 0}
						<div class="px-5 pt-3 pb-4 flex flex-wrap gap-1.5">
							{#each entry.events as event (event.id)}
								<button
									type="button"
									onclick={() => openDetail(event)}
									class="inline-flex items-center gap-1 rounded-full border border-transparent bg-secondary text-secondary-foreground px-2.5 py-0.5 text-xs font-semibold transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
								>
									{EVENT_ICONS[event.type] ?? '📝'}
									<span class="capitalize">{event.type}</span>
									{#if event.durationMinutes}
										<span class="text-muted-foreground">· {event.durationMinutes}m</span>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</Card>
			{/each}
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
