<script lang="ts">
	import { Button } from '#lib/components/ui/button/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { gettingStartedHref, type GettingStartedTarget } from '#lib/gettingStarted.js';

	// On the household page a step has no single pet, so it offers one button per pet.
	let {
		target,
		pets,
		today
	}: { target: GettingStartedTarget; pets: { id: string; name: string }[]; today: string } =
		$props();

	const locale = getLocale();
</script>

{#if pets.length > 0}
	<div class="relative z-10 mt-2 flex flex-wrap gap-2">
		{#each pets as pet (pet.id)}
			<Button
				href={gettingStartedHref(target, pet.id, today)}
				variant="outline"
				size="sm"
				class="h-11 max-w-full border-muted-foreground/30 bg-card"
			>
				<span class="truncate">{t(locale, 'gettingStarted.forPet', { name: pet.name })}</span>
			</Button>
		{/each}
	</div>
{/if}
