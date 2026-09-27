<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { Smile } from '@lucide/svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import MoodStrip from './MoodStrip.svelte';
	import MoodGrid from './MoodGrid.svelte';
	import { t, getLocale } from '$lib/i18n';
	import {
		MOOD_TREND_RANGES,
		buildMoodDays,
		isMoodTrendRange,
		type Mood,
		type MoodTrendRange
	} from '$lib/moodTrend';

	interface Props {
		companionId: string;
		archived: boolean;
		history: { date: string; mood: Mood }[];
		today: string;
		initialDays: MoodTrendRange;
	}

	let { companionId, archived, history, today, initialDays }: Props = $props();
	const locale = getLocale();

	// Seeded once from the server; the toggle owns it afterwards.
	let days = $state<MoodTrendRange>(untrack(() => initialDays));
	let moodDays = $derived(buildMoodDays(history, today, days));
	let hasAny = $derived(moodDays.some((d) => d.mood !== null));

	const RANGE_KEY = {
		7: 'page.dashboard.moodTrend.range7',
		30: 'page.dashboard.moodTrend.range30',
		90: 'page.dashboard.moodTrend.range90'
	} as const;
</script>

<Card data-testid="mood-trend">
	<CardHeader class="pb-3">
		<div class="flex items-center justify-between gap-2">
			<CardTitle class="flex items-center gap-2 text-sm font-semibold">
				<Smile class="h-4 w-4" />
				{t(locale, 'page.dashboard.moodTrend.title')}
			</CardTitle>
			<form
				method="POST"
				action="?/setMoodTrendDays"
				role="group"
				aria-label={t(locale, 'page.dashboard.moodTrend.rangeGroup')}
				class="inline-flex rounded-md border border-border p-0.5"
				use:enhance={({ submitter }) => {
					const next = Number((submitter as HTMLButtonElement | null)?.value);
					if (isMoodTrendRange(next)) days = next;
					// A failed save stays silent; the next load shows the stored value.
					return async ({ update }) => update({ invalidateAll: false, reset: false });
				}}
			>
				{#each MOOD_TREND_RANGES as r (r)}
					<button
						type="submit"
						name="days"
						value={r}
						aria-pressed={days === r}
						aria-label={t(locale, 'page.dashboard.moodTrend.rangeAria', { days: String(r) })}
						class="rounded px-2 py-0.5 text-xs font-medium transition-colors {days === r
							? 'bg-primary text-primary-foreground'
							: 'text-muted-foreground hover:bg-accent'}"
					>
						{t(locale, RANGE_KEY[r])}
					</button>
				{/each}
			</form>
		</div>
	</CardHeader>
	{#snippet emptyAction()}
		<Button href="/{companionId}/journal/{today}" variant="outline" size="sm">
			{t(locale, 'page.dashboard.moodTrend.emptyCta')}
		</Button>
	{/snippet}
	<CardContent class="pt-0">
		{#if !hasAny}
			<EmptyState
				size="sm"
				title={t(locale, 'page.dashboard.moodTrend.emptyTitle')}
				action={archived ? undefined : emptyAction}
			/>
		{:else if days === 7}
			<MoodStrip {companionId} days={moodDays} {locale} />
		{:else}
			<MoodGrid {companionId} days={moodDays} {locale} />
		{/if}
	</CardContent>
</Card>
