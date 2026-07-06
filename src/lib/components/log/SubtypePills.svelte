<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activitySubtypeOptions } from '$lib/i18n/labels';

	let {
		type,
		selected = $bindable(null),
		name = 'subtype'
	}: {
		type: string;
		selected?: string | null;
		name?: string;
	} = $props();

	const locale = getLocale();
	let options = $derived(activitySubtypeOptions(locale, type));

	// Switching to a type where the current subtype is invalid clears it.
	$effect(() => {
		if (selected && !options.some((o) => o.value === selected)) selected = null;
	});
</script>

{#if options.length > 0}
	<fieldset class="space-y-1.5 animate-slide-up">
		<legend class="text-sm font-medium text-foreground"
			>{t(locale, 'page.log.subtypeLabel')}
			<span class="font-normal text-muted-foreground">{t(locale, 'page.log.notesOptional')}</span
			></legend
		>
		<input type="hidden" {name} value={selected ?? ''} />
		<div class="flex flex-wrap gap-2">
			{#each options as opt (opt.value)}
				{@const active = selected === opt.value}
				<button
					type="button"
					aria-pressed={active}
					onclick={() => (selected = active ? null : opt.value)}
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
