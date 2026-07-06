<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activitySubtypeOptions } from '$lib/i18n/labels';

	let {
		type,
		selected = $bindable([]),
		name = 'subtypes'
	}: {
		type: string;
		selected?: string[];
		name?: string;
	} = $props();

	const locale = getLocale();
	let options = $derived(activitySubtypeOptions(locale, type));

	// Switching to a type prunes any now-invalid selections. Guard the assignment
	// so it only runs when something actually changed (avoids effect loops).
	$effect(() => {
		const pruned = selected.filter((v) => options.some((o) => o.value === v));
		if (pruned.length !== selected.length) selected = pruned;
	});
</script>

{#if options.length > 0}
	<fieldset class="space-y-1.5 animate-slide-up">
		<legend class="text-sm font-medium text-foreground"
			>{t(locale, 'page.log.subtypeLabel')}
			<span class="font-normal text-muted-foreground">{t(locale, 'page.log.notesOptional')}</span
			></legend
		>
		{#each selected as v (v)}
			<input type="hidden" {name} value={v} />
		{/each}
		<div class="flex flex-wrap gap-2">
			{#each options as opt (opt.value)}
				{@const active = selected.includes(opt.value)}
				<button
					type="button"
					aria-pressed={active}
					onclick={() =>
						(selected = active
							? selected.filter((v) => v !== opt.value)
							: [...selected, opt.value])}
					class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
					focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
					{active
						? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
						: 'border-border text-muted-foreground hover:text-foreground'}"
				>
					{#if active}
						<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{/if}
					{opt.icon}
					{opt.label}
				</button>
			{/each}
		</div>
	</fieldset>
{/if}
