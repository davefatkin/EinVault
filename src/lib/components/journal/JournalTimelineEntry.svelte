<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';
	import { Button } from '$lib/components/ui/button/index.js';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Pencil, NotebookPen } from '@lucide/svelte';
	import { MOOD_ICONS, activityDisplayIcon, activityDisplayLabel } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';
	import type { JournalEntry, DailyEvent } from '$server/db/schema';
	import type { UserRef } from '$lib/types';
	import type { Species } from '$lib/activityTypes';
	import MediaThumbs from '$lib/components/MediaThumbs.svelte';
	import { journalMediaUrl, type MediaItem } from '$lib/media';

	type Activity = DailyEvent & { logger: UserRef };

	type Entry = Pick<JournalEntry, 'date' | 'mood' | 'body' | 'loggedBy' | 'updatedBy'> & {
		logger: UserRef | null;
		updater: { displayName: string } | null;
		photos: MediaItem[];
		events: Activity[];
	};

	interface Props {
		entry: Entry;
		companionId: string;
		today: string;
		canEdit: boolean;
		onOpenLightbox: (items: MediaItem[], date: string, index: number) => void;
		onOpenActivity: (event: Activity) => void;
		species?: Species;
	}

	let { entry, companionId, today, canEdit, onOpenLightbox, onOpenActivity, species }: Props =
		$props();

	const locale = getLocale();
	let isToday = $derived(entry.date === today);

	function dayNum(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric' });
	}
	function weekday(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' });
	}
</script>

<div class="flex gap-3">
	<div class="relative flex w-12 shrink-0 flex-col items-center">
		<div
			class="font-display text-xl font-bold leading-none {isToday
				? 'text-primary'
				: 'text-foreground'}"
		>
			{dayNum(entry.date)}
		</div>
		<div class="text-[10px] uppercase tracking-wide text-muted-foreground">
			{weekday(entry.date)}
		</div>
		<div
			class="mt-1.5 h-3 w-3 rounded-full ring-4 ring-background {isToday
				? 'bg-primary'
				: 'bg-muted-foreground/50'}"
			aria-hidden="true"
		></div>
		<!-- Connector: fills the rest of the row height and bridges the gap to the next entry. -->
		<div class="mt-1.5 -mb-3 w-0.5 flex-1 rounded-full bg-border" aria-hidden="true"></div>
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
					<ByLine
						user={entry.logger}
						updater={entry.updatedBy && entry.updatedBy !== entry.loggedBy ? entry.updater : null}
						variant="inline"
						class="ml-0"
					/>
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
			<div class="mt-3">
				<MediaThumbs
					items={entry.photos}
					urlFor={(item) => journalMediaUrl(companionId, entry.date, item)}
					onopen={(index) => onOpenLightbox(entry.photos, entry.date, index)}
					max={4}
				/>
			</div>
		{/if}

		{#if entry.body?.trim()}
			<div class="prose prose-sm dark:prose-invert mt-3 max-w-none leading-relaxed">
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
						class="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold transition-colors hover:bg-gold/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{activityDisplayIcon(event.type, event.subtypes, species)}
						<span>{activityDisplayLabel(locale, event.type, event.subtypes)}</span>
						{#if event.durationMinutes}<span class="text-muted-foreground"
								>· {event.durationMinutes}m</span
							>{/if}
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
