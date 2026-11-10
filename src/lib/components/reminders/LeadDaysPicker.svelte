<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		MAX_LEAD_TIMES,
		leadChipOptions,
		pruneLeadDays,
		serializeLeadDays
	} from '#lib/reminderLeadTimes.js';

	let {
		value = $bindable([]),
		recurrence = null,
		name = 'notifyLeadDays'
	}: {
		value?: number[];
		recurrence?: { unit: 'day' | 'week' | 'month' | 'year'; interval: number } | null;
		name?: string;
	} = $props();

	const locale = getLocale();

	const offered = $derived(leadChipOptions(value, recurrence));

	// Leads that are too long for the current repeat period are hidden and not saved, but
	// kept in `value` so they come back if the period grows again (e.g. while retyping it).
	const effective = $derived(pruneLeadDays(value, recurrence));

	function label(n: number): string {
		if (n === 7 || n === 14) {
			return t(locale, n === 7 ? 'page.reminders.leadWeek' : 'page.reminders.leadWeeks', {
				count: n / 7
			});
		}
		return t(locale, n === 1 ? 'page.reminders.leadDay' : 'page.reminders.leadDays', {
			count: n
		});
	}

	function toggle(n: number) {
		value = effective.includes(n) ? effective.filter((v) => v !== n) : [...effective, n];
	}

	const full = $derived(effective.length >= MAX_LEAD_TIMES);
</script>

<fieldset class="space-y-1.5">
	<legend class="text-sm font-medium text-foreground"
		>{t(locale, 'page.reminders.leadLabel')}</legend
	>
	<input type="hidden" {name} value={serializeLeadDays(effective) ?? ''} />
	<div class="flex flex-wrap gap-2">
		{#each offered as n (n)}
			{@const active = effective.includes(n)}
			<button
				type="button"
				aria-pressed={active}
				disabled={!active && full}
				onclick={() => toggle(n)}
				class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
				focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
				{active
					? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				{#if active}
					<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{/if}
				{label(n)}
			</button>
		{/each}
	</div>
</fieldset>
