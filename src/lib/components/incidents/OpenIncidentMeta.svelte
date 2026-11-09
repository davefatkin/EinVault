<script lang="ts">
	import LocalTime from '#lib/components/LocalTime.svelte';
	import { incidentDayNumber, type OpenIncidentSummary } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// "Day N · Updated 2 hours ago" for an open incident, shared by the Health
	// Log list and the dashboard banner.
	let {
		incident,
		class: className = ''
	}: { incident: Pick<OpenIncidentSummary, 'occurredAt' | 'lastActivityAt'>; class?: string } =
		$props();
	const locale = getLocale();
</script>

<span class={['text-xs text-muted-foreground', className]}>
	{t(locale, 'page.incident.day', { day: incidentDayNumber(incident.occurredAt) })}
	·
	{t(locale, 'page.incident.updated')}
	<LocalTime date={incident.lastActivityAt} format="relative" />
</span>
