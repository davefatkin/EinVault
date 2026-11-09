<script lang="ts">
	import { ChevronRight } from '@lucide/svelte';
	import SeverityChip from './SeverityChip.svelte';
	import OpenIncidentMeta from './OpenIncidentMeta.svelte';
	import type { OpenIncidentSummary } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Amber strip on the companion dashboard and the caretaker's companion page:
	// one linked row per open incident. Renders nothing when none are open.
	let {
		incidents,
		hrefFor
	}: { incidents: OpenIncidentSummary[]; hrefFor: (id: string) => string } = $props();
	const locale = getLocale();
</script>

{#if incidents.length > 0}
	<section
		aria-label={t(locale, 'page.health.openIncidents')}
		class="rounded-xl border border-gold/50 bg-[color-mix(in_srgb,var(--color-gold)_8%,var(--color-card))] p-1"
	>
		<ul class="divide-y divide-gold/25">
			{#each incidents as incident (incident.id)}
				<li>
					<a
						href={hrefFor(incident.id)}
						class="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-3 py-2 transition-colors hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<span class="flex min-w-0 flex-wrap items-center gap-2">
							<span class="break-words text-sm font-semibold text-foreground">{incident.title}</span
							>
							{#if incident.currentSeverity}
								<SeverityChip severity={incident.currentSeverity} />
							{/if}
						</span>
						<span class="ml-auto flex items-center gap-1">
							<OpenIncidentMeta {incident} />
							<ChevronRight class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
						</span>
					</a>
				</li>
			{/each}
		</ul>
	</section>
{/if}
