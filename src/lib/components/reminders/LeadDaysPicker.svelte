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

	// A selection that is no longer shorter than the repeat period is dropped.
	$effect(() => {
		const kept = pruneLeadDays(value, recurrence);
		if (kept.length !== value.length) value = kept;
	});

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
		value = value.includes(n) ? value.filter((v) => v !== n) : [...value, n];
	}

	const full = $derived(value.length >= MAX_LEAD_TIMES);
</script>

<fieldset class="space-y-1.5">
	<legend class="text-sm font-medium text-foreground"
		>{t(locale, 'page.reminders.leadLabel')}</legend
	>
	<input type="hidden" {name} value={serializeLeadDays(value) ?? ''} />
	<div class="flex flex-wrap gap-2">
		{#each offered as n (n)}
			{@const active = value.includes(n)}
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
