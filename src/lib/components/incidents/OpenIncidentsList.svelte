<script lang="ts">
	import LocalTime from '#lib/components/LocalTime.svelte';
	import SeverityChip from './SeverityChip.svelte';
	import { stripMarkdown } from '#lib/markdown.js';
	import { incidentDayNumber, type OpenIncidentSummary } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Open incidents as a list of links, each with its current severity, day
	// count, last activity and the latest update.
	let {
		incidents,
		href
	}: { incidents: OpenIncidentSummary[]; href: (incident: OpenIncidentSummary) => string } =
		$props();
	const locale = getLocale();
</script>

<ul class="divide-y divide-border rounded-2xl border border-gold/40 bg-gold/5">
	{#each incidents as incident (incident.id)}
		<li class="px-5 py-3">
			<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
				<a
					href={href(incident)}
					class="font-medium text-sm text-foreground hover:underline break-words"
					>{incident.title}</a
				>
				{#if incident.currentSeverity}<SeverityChip severity={incident.currentSeverity} />{/if}
				<span class="text-xs text-muted-foreground">
					{t(locale, 'page.incident.day', { day: incidentDayNumber(incident.occurredAt) })}
					·
					{t(locale, 'page.incident.updated')}
					<LocalTime date={incident.lastActivityAt} format="relative" />
				</span>
			</div>
			{#if incident.latestUpdate}
				<p class="mt-0.5 truncate text-xs text-muted-foreground">
					{stripMarkdown(incident.latestUpdate.body)}
				</p>
			{/if}
		</li>
	{/each}
</ul>
