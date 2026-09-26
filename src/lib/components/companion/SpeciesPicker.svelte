<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { speciesOptions } from '$lib/i18n/labels';
	import type { Species } from '$lib/activityTypes';

	let {
		value = $bindable<Species | ''>(''),
		name = 'species'
	}: {
		value?: Species | '';
		name?: string;
	} = $props();

	const locale = getLocale();
	const options = speciesOptions(locale);
</script>

<fieldset class="space-y-2">
	<legend class="text-sm font-medium text-foreground"
		>{t(locale, 'page.companion.labelSpecies')}</legend
	>
	<div class="grid grid-cols-3 gap-2">
		{#each options as opt (opt.value)}
			<label class="cursor-pointer">
				<input
					type="radio"
					{name}
					value={opt.value}
					bind:group={value}
					required
					class="sr-only peer"
				/>
				<span
					class="flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3
						text-sm font-medium transition-all text-center
						peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
						{value === opt.value
						? 'bg-primary/10 border-primary ring-2 ring-inset ring-primary/40 text-primary shadow-sm'
						: 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
				>
					<span class="text-2xl" aria-hidden="true">{opt.icon}</span>
					<span class="inline-flex items-center gap-1">
						{#if value === opt.value}<Check class="h-3.5 w-3.5" aria-hidden="true" />{/if}
						{opt.label}
					</span>
				</span>
			</label>
		{/each}
	</div>
</fieldset>
