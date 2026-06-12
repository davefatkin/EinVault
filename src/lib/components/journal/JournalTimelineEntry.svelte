<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';
	import { Button } from '$lib/components/ui/button/index.js';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Pencil, NotebookPen, Play } from '@lucide/svelte';
	import { MOOD_ICONS, ACTIVITY_ICONS } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';
	import type { JournalPhoto, DailyEvent } from '$server/db/schema';
	import type { UserRef } from '$lib/types';

	type Photo = JournalPhoto & { logger: UserRef };
	type Activity = DailyEvent & { logger: UserRef };

	type Entry = {
		date: string;
		mood: string | null;
		body: string | null;
		loggedBy: string | null;
		updatedBy: string | null;
		logger: UserRef;
		updater: { displayName: string } | null;
		photos: Photo[];
		events: Activity[];
	};

	interface Props {
		entry: Entry;
		companionId: string;
		today: string;
		canEdit: boolean;
		onOpenLightbox: (photos: Photo[], date: string, index: number) => void;
		onOpenActivity: (event: Activity) => void;
	}

	let { entry, companionId, today, canEdit, onOpenLightbox, onOpenActivity }: Props = $props();

	const locale = getLocale();
	const EVENT_ICONS = ACTIVITY_ICONS;
	let isToday = $derived(entry.date === today);

	const MAX_THUMBS = 4;
	let visiblePhotos = $derived(entry.photos.slice(0, MAX_THUMBS));
	let overflow = $derived(Math.max(0, entry.photos.length - MAX_THUMBS));

	function dayNum(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric' });
	}
	function weekday(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
	}
	function mediaUrl(item: Entry['photos'][number]) {
		return `/api/photos/journal/${companionId}/${entry.date}/${item.filename}`;
	}
	function posterUrl(item: Entry['photos'][number]) {
		return item.posterKey ? `${mediaUrl(item)}?poster` : null;
	}
</script>

<div class="flex gap-3">
	<div class="relative w-12 shrink-0 text-center">
		<div
			class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border"
			aria-hidden="true"
		></div>
		<div
			class="relative z-10 mx-auto mt-1 h-2.5 w-2.5 rounded-full ring-4 ring-background {isToday
				? 'bg-primary'
				: 'bg-muted-foreground/40'}"
			aria-hidden="true"
		></div>
		<div
			class="mt-1.5 font-display text-xl font-bold leading-none {isToday
				? 'text-primary'
				: 'text-foreground'}"
		>
			{dayNum(entry.date)}
		</div>
		<div class="text-[10px] uppercase tracking-wide text-muted-foreground">
			{weekday(entry.date)}
		</div>
	</div>

	<div class="min-w-0 flex-1 rounded-2xl border bg-card p-4">
		<div class="flex items-start justify-between gap-3">
			<div class="flex min-w-0 items-center gap-2">
				{#if entry.mood && MOOD_ICONS[entry.mood]}
					<span class="text-xl shrink-0" title={entry.mood}>{MOOD_ICONS[entry.mood]}</span>
				{:else}
					<NotebookPen class="h-5 w-5 shrink-0 text-muted-foreground/40" />
				{/if}
				<div class="min-w-0 text-xs">
					{#if isToday}<span class="font-medium text-primary"
							>{t(locale, 'page.journal.today')}</span
						>{/if}
					<ByLine user={entry.logger} variant="inline" class="ml-0" />
					{#if entry.updatedBy && entry.updatedBy !== entry.loggedBy && entry.updater}
						<span class="text-muted-foreground"
							>· {t(locale, 'common.updatedBy', { name: entry.updater.displayName })}</span
						>
					{/if}
				</div>
			</div>
			{#if canEdit}
				<Button
					href="/{companionId}/journal/{entry.date}"
					variant="soft"
					size="sm"
					class="h-7 shrink-0 gap-1 px-2 text-xs"
				>
					<Pencil class="h-3 w-3" />
					{t(locale, 'page.journal.edit')}
				</Button>
			{/if}
		</div>

		{#if entry.photos.length > 0}
			<div class="mt-3 flex gap-1.5">
				{#each visiblePhotos as item, i (item.id)}
					<button
						type="button"
						onclick={() => onOpenLightbox(entry.photos, entry.date, i)}
						class="relative h-16 w-16 overflow-hidden rounded-lg transition-opacity hover:opacity-90"
						title={item.originalName ??
							t(
								locale,
								item.mediaType === 'video' ? 'page.journal.videoAlt' : 'page.journal.photoAlt'
							)}
					>
						{#if item.mediaType === 'video' && item.posterKey}
							<img
								src={posterUrl(item)}
								alt={item.originalName ?? ''}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{:else if item.mediaType === 'video'}
							<video
								src={mediaUrl(item)}
								preload="metadata"
								muted
								playsinline
								class="h-full w-full object-cover"
							></video>
						{:else}
							<img
								src={mediaUrl(item)}
								alt={item.originalName ?? ''}
								class="h-full w-full object-cover"
								loading="lazy"
							/>
						{/if}
						{#if item.mediaType === 'video'}
							<span
								class="absolute inset-0 flex items-center justify-center bg-black/20"
								aria-hidden="true"
								><span class="rounded-full bg-black/55 p-1.5"
									><Play class="h-4 w-4 text-white" /></span
								></span
							>
						{/if}
						{#if i === MAX_THUMBS - 1 && overflow > 0}
							<span
								class="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white"
								>+{overflow}</span
							>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		{#if entry.body?.trim()}
			<div
				class="prose prose-sm dark:prose-invert mt-3 max-w-none leading-relaxed overflow-hidden"
				style="display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical"
			>
				{@html renderMarkdown(entry.body)}
			</div>
		{:else if !entry.photos.length && !entry.events.length}
			<p class="mt-3 text-sm italic text-muted-foreground">{t(locale, 'page.journal.noNotes')}</p>
		{/if}

		{#if entry.events.length > 0}
			<div class="mt-3 flex flex-wrap gap-1.5">
				{#each entry.events as event (event.id)}
					<button
						type="button"
						onclick={() => onOpenActivity(event)}
						class="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{EVENT_ICONS[event.type] ?? '📝'}
						<span class="capitalize">{event.type}</span>
						{#if event.durationMinutes}<span class="text-muted-foreground"
								>· {event.durationMinutes}m</span
							>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
