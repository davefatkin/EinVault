<script lang="ts">
	import { t, type Locale } from '$lib/i18n';
	import { MOOD_ICONS, moodLabel } from '$lib/i18n/labels';
	import { formatDayLabel, formatWeekdayShort, type MoodDay } from '$lib/moodTrend';

	let { companionId, days, locale }: { companionId: string; days: MoodDay[]; locale: Locale } =
		$props();

	function label(day: MoodDay): string {
		return t(locale, 'page.dashboard.moodTrend.cellLabel', {
			date: formatDayLabel(day.date, locale),
			mood: day.mood ? moodLabel(locale, day.mood) : t(locale, 'page.dashboard.moodTrend.noEntry')
		});
	}
</script>

<ol class="grid grid-cols-7 gap-1">
	{#each days as day (day.date)}
		<li>
			<a
				href="/{companionId}/journal/{day.date}"
				data-date={day.date}
				data-mood={day.mood ?? 'none'}
				aria-label={label(day)}
				title={label(day)}
				class="flex flex-col items-center gap-1 rounded-md py-1.5 transition-colors hover:bg-accent"
			>
				{#if day.mood}
					<span aria-hidden="true" class="text-xl leading-none">{MOOD_ICONS[day.mood]}</span>
				{:else}
					<span aria-hidden="true" class="h-5 w-5 rounded-full border border-dashed border-border"
					></span>
				{/if}
				<span aria-hidden="true" class="text-[11px] text-muted-foreground"
					>{formatWeekdayShort(day.date, locale)}</span
				>
			</a>
		</li>
	{/each}
</ol>
