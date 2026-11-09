<script lang="ts">
	import SeverityChip from './SeverityChip.svelte';
	import OpenIncidentMeta from './OpenIncidentMeta.svelte';
	import { stripMarkdown } from '#lib/markdown.js';
	import type { OpenIncidentSummary } from '#lib/incidents.js';

	// Open incidents as a list of links, each with its current severity, day
	// count, last activity and the latest update.
	let {
		incidents,
		href
	}: { incidents: OpenIncidentSummary[]; href: (incident: OpenIncidentSummary) => string } =
		$props();
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
				<OpenIncidentMeta {incident} />
			</div>
			{#if incident.latestUpdate}
				<p class="mt-0.5 truncate text-xs text-muted-foreground">
					{stripMarkdown(incident.latestUpdate.body)}
				</p>
			{/if}
		</li>
	{/each}
</ul>
