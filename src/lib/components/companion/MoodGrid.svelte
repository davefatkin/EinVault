<script lang="ts">
	import { t, type Locale } from '$lib/i18n';
	import { moodLabel } from '$lib/i18n/labels';
	import { MOODS } from '$lib/mood';
	import {
		MOOD_TONE,
		WEEK_START,
		formatDayLabel,
		monthColumnLabels,
		toWeekColumns,
		weekdayRowLabels,
		type MoodDay
	} from '$lib/moodTrend';

	let { companionId, days, locale }: { companionId: string; days: MoodDay[]; locale: Locale } =
		$props();

	let columns = $derived(toWeekColumns(days, WEEK_START[locale]));
	let months = $derived(monthColumnLabels(columns, locale));
	let today = $derived(days.at(-1)?.date);
	let weekdays = $derived(weekdayRowLabels(WEEK_START[locale], locale));
	let cols = $derived(`repeat(${columns.length}, minmax(0, 1fr))`);
	const EMPTY = 'border border-dashed border-border';

	function label(day: MoodDay): string {
		return t(locale, 'page.dashboard.moodTrend.cellLabel', {
			date: formatDayLabel(day.date, locale),
			mood: day.mood ? moodLabel(locale, day.mood) : t(locale, 'page.dashboard.moodTrend.noEntry')
		});
	}
</script>

<!-- 7 rows (weekdays) x one column per week. Columns share the card width;
     rows keep a fixed height, so cells stretch into bricks on wide cards.
     Labels are decorative: every cell's aria-label carries its full date. -->
<div class="flex gap-1.5">
	<div aria-hidden="true" class="flex flex-col gap-[3px] text-[10px] text-muted-foreground">
		<span class="h-4"></span>
		{#each weekdays as weekday, r (r)}
			<span class="flex h-4 items-center sm:h-5">{weekday}</span>
		{/each}
	</div>

	<div class="flex min-w-0 flex-1 flex-col gap-[3px]">
		<div aria-hidden="true" class="grid h-4 gap-[3px]" style="grid-template-columns: {cols}">
			{#each months as month, ci (ci)}
				<span class="overflow-visible whitespace-nowrap text-[10px] leading-4 text-muted-foreground"
					>{month ?? ''}</span
				>
			{/each}
		</div>

		<div
			class="grid w-full grid-flow-col grid-rows-7 gap-[3px]"
			style="grid-template-columns: {cols}"
		>
			{#each columns as col, ci (ci)}
				{#each col as day, ri (`${ci}-${ri}`)}
					{#if day}
						<a
							href="/{companionId}/journal/{day.date}"
							tabindex="-1"
							data-date={day.date}
							data-mood={day.mood ?? 'none'}
							aria-label={label(day)}
							title={label(day)}
							class="h-4 rounded-[3px] outline-none hover:ring-2 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring sm:h-5 {day.mood
								? MOOD_TONE[day.mood]
								: EMPTY} {day.date === today ? 'ring-2 ring-foreground/60' : ''}"
						></a>
					{:else}
						<span aria-hidden="true" class="h-4 sm:h-5"></span>
					{/if}
				{/each}
			{/each}
		</div>
	</div>
</div>

<ul
	class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
	aria-label={t(locale, 'page.dashboard.moodTrend.legend')}
>
	{#each MOODS as m (m)}
		<li class="inline-flex items-center gap-1">
			<span aria-hidden="true" class="size-2.5 rounded-[2px] {MOOD_TONE[m]}"></span>
			{moodLabel(locale, m)}
		</li>
	{/each}
	<li class="inline-flex items-center gap-1">
		<span aria-hidden="true" class="size-2.5 rounded-[2px] {EMPTY}"></span>
		{t(locale, 'page.dashboard.moodTrend.noEntry')}
	</li>
</ul>
