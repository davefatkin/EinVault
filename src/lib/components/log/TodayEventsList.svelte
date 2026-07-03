<script lang="ts">
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Trash2, Activity } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { ACTIVITY_ICONS } from '$lib/i18n/labels';

	interface TodayEvent {
		id: string;
		type: string;
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
		canDelete = (event: TodayEvent) => event.loggedBy === currentUserId
	}: {
		events: TodayEvent[];
		currentUserId: string | undefined;
		deleteAction?: string;
		canDelete?: (event: TodayEvent) => boolean;
	} = $props();

	const locale = getLocale();
</script>

{#if events.length === 0}
	<EmptyState size="sm" tint="gold" title={t(locale, 'page.log.nothingLoggedYet')}>
		{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
	</EmptyState>
{:else}
	<div class="space-y-2">
		{#each events as event (event.id)}
			<div class="flex items-center gap-3 py-2 border-b last:border-0">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg"
					>{ACTIVITY_ICONS[event.type] ?? '📝'}</span
				>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2">
						<Badge variant="gold" class="capitalize">{event.type}</Badge>
						{#if event.durationMinutes}
							<span class="text-xs text-muted-foreground">{event.durationMinutes} min</span>
						{/if}
					</div>
					{#if event.notes}
						<p class="text-sm truncate text-muted-foreground mt-0.5">{event.notes}</p>
					{/if}
				</div>
				<div class="text-xs shrink-0 text-muted-foreground text-right">
					<LocalTime date={event.loggedAt} format="time" />
					<ByLine user={event.logger} />
				</div>
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
