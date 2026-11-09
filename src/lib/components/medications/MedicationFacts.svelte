<script lang="ts">
	import { getContext } from 'svelte';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import { renderMarkdown } from '#lib/markdown.js';
	import { formatDateOnly } from '#lib/date.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		formatMedicationSchedule,
		medicationEndState,
		todayInZone,
		type MedicationSummary
	} from '#lib/medications.js';

	// What a medication summary says: dose and schedule, instructions, then
	// next due and last given (or when it ended). Shared by the summary row and
	// the medication page so they never drift apart.
	let {
		medication,
		showStarted = false
	}: { medication: MedicationSummary; showStarted?: boolean } = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');

	const schedule = $derived(formatMedicationSchedule(medication.schedule, locale, timeZone));
	const doseLine = $derived([medication.dose, schedule].filter(Boolean).join(' · '));
	const overdue = $derived(
		medication.nextDueAt !== null && new Date(medication.nextDueAt).getTime() < Date.now()
	);
	// The last day ("Ends today") is a badge next to the name instead.
	const endState = $derived(medicationEndState(medication, todayInZone(timeZone)));
	const dateLine = $derived(
		[
			showStarted
				? t(locale, 'page.medications.startedOn', {
						date: formatDateOnly(medication.startedOn, locale) ?? medication.startedOn
					})
				: null,
			medication.endedOn && (endState === 'endsOn' || endState === 'endedOn')
				? t(locale, `page.medications.${endState}`, {
						date: formatDateOnly(medication.endedOn, locale) ?? medication.endedOn
					})
				: null
		]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<div class="min-w-0 space-y-1 text-sm">
	{#if doseLine}
		<p class="text-foreground">{doseLine}</p>
	{/if}
	{#if medication.instructions}
		<div class="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
			{@html renderMarkdown(medication.instructions)}
		</div>
	{/if}
	<dl class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
		{#if medication.active && medication.nextDueAt}
			<div class="flex gap-1">
				<dt>{t(locale, 'page.medications.nextDue')}</dt>
				<dd class={overdue ? 'text-coral' : 'text-foreground'}>
					<LocalTime date={medication.nextDueAt} format="datetime" />
				</dd>
			</div>
		{/if}
		<div class="flex gap-1">
			<dt>{t(locale, 'page.medications.lastGiven')}</dt>
			<dd class="text-foreground">
				{#if medication.lastGiven}
					<LocalTime date={medication.lastGiven.at} format="relative" />
					{#if medication.lastGiven.by}
						<span class="text-muted-foreground">
							{t(locale, 'page.medications.byName', {
								name: medication.lastGiven.by.displayName
							})}
						</span>
					{/if}
				{:else}
					{t(locale, 'page.medications.notGivenYet')}
				{/if}
			</dd>
		</div>
	</dl>
	{#if dateLine}
		<p class="text-xs text-muted-foreground">{dateLine}</p>
	{/if}
</div>
