<script lang="ts">
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Trash2, Activity } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ActivityDetailModal from '$lib/components/log/ActivityDetailModal.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activityDisplayIcon, activityDisplayLabel } from '$lib/i18n/labels';
	import { stripMarkdown } from '$lib/markdown';

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

	// Detail modal, shared with the dashboard/journal/caretaker surfaces.
	let selected = $state<TodayEvent | null>(null);

	function eventDate(d: Date | string): string {
		return new Date(d).toISOString().slice(0, 10);
	}

	function openDetail(event: TodayEvent) {
		selected = event;
	}

	function closeDetail() {
		selected = null;
	}
</script>

{#if selected}
	<ActivityDetailModal
		event={selected}
		onclose={closeDetail}
		journalHref={journalHrefBase ? `${journalHrefBase}/${eventDate(selected.loggedAt)}` : null}
	/>
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
							variant="softDestructive"
							size="sm"
							class="h-7 px-2 text-xs gap-1.5 shrink-0"
							aria-label={t(locale, 'aria.deleteEntry')}
						>
							<Trash2 class="h-3.5 w-3.5" /><span class="hidden sm:inline"
								>{t(locale, 'common.delete')}</span
							>
						</Button>
					</form>
				{/if}
			</div>
		{/each}
	</div>
{/if}
