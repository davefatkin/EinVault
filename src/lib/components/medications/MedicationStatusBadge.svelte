<script lang="ts">
	import { getContext } from 'svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { medicationEndState, todayInZone, type MedicationSummary } from '#lib/medications.js';

	// "Ended" once a medication is over, "Ends today" on its last day.
	let { medication }: { medication: Pick<MedicationSummary, 'active' | 'endedOn'> } = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');
	const state = $derived(medicationEndState(medication, todayInZone(timeZone)));
</script>

{#if state === 'endedOn'}
	<Badge variant="secondary">{t(locale, 'page.medications.endedBadge')}</Badge>
{:else if state === 'endsToday'}
	<Badge variant="gold">{t(locale, 'page.medications.endsToday')}</Badge>
{/if}
