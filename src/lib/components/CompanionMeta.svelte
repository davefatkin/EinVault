<script lang="ts">
	// The "🐕 Breed · ~4y old · Male · Home since Mar 4, 2019" line under a
	// companion's name on the overview and the care page. Missing facts drop out
	// along with their separator.
	import Age from '#lib/components/Age.svelte';
	import { ageParts } from '#lib/age.js';
	import { homeSinceLabel, sexLabel, speciesLabels } from '#lib/i18n/labels.js';
	import { getLocale } from '#lib/i18n/index.js';
	import { toSpecies } from '#lib/species.js';

	let {
		companion,
		today
	}: {
		companion: {
			species: string | null;
			breed: string | null;
			dob: string | null;
			dobApproximate: boolean;
			sex: string | null;
			homecomingDate: string | null;
		};
		today: string;
	} = $props();

	const locale = getLocale();
	const labels = $derived(speciesLabels(locale, toSpecies(companion.species)));
	const hasAge = $derived(ageParts(companion.dob, today) !== null);
	const homeSince = $derived(homeSinceLabel(locale, companion.homecomingDate));
</script>

<p data-testid="companion-meta" class="text-sm text-muted-foreground mt-0.5">
	{labels.icon}
	{companion.breed ?? labels.breedFallback}
	{#if hasAge}
		· <Age dob={companion.dob} approximate={companion.dobApproximate} {today} />
	{/if}
	{#if companion.sex}
		· {sexLabel(locale, companion.sex)}
	{/if}
	{#if homeSince}
		· {homeSince}
	{/if}
</p>
