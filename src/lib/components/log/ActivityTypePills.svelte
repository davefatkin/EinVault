<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activityTypeOptions } from '$lib/i18n/labels';
	import type { DailyEventType, Species } from '$lib/activityTypes';

	// `current` is an existing value to keep visible even when it's not in
	// `types` (an event or quick log saved before a species change).
	let {
		types,
		selected = $bindable(''),
		current = null,
		species,
		name = 'type',
		legend,
		compact = false
	}: {
		types: readonly DailyEventType[];
		selected?: string;
		current?: string | null;
		species?: Species;
		name?: string;
		legend?: string;
		// Small wrapping pills instead of the tile grid, for forms nested in cards.
		compact?: boolean;
	} = $props();

	const locale = getLocale();
	let shown = $derived(
		current && !(types as readonly string[]).includes(current)
			? [...types, current as DailyEventType]
			: types
	);
	let options = $derived(activityTypeOptions(locale, shown, species));
</script>

<fieldset class={compact ? 'space-y-1.5' : 'space-y-2'}>
	<legend class="text-sm font-medium text-foreground"
		>{legend ?? t(locale, 'page.log.activityLabel')}</legend
	>
	<div class={compact ? 'flex flex-wrap gap-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-2'}>
		{#each options as opt (opt.value)}
			<label class="cursor-pointer">
				<input type="radio" {name} value={opt.value} bind:group={selected} class="sr-only peer" />
				<span
					class="flex items-center justify-center gap-1 border
				text-sm font-medium transition-all text-center
				{compact ? 'rounded-lg px-3 py-1.5' : 'rounded-xl px-3 py-3'}
				peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
				{selected === opt.value
						? 'bg-primary/10 border-primary ring-2 ring-inset ring-primary/40 text-primary shadow-sm'
						: 'border-border text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground'}"
				>
					{#if selected === opt.value}
						<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
					{/if}
					{opt.icon}
					{opt.label}
				</span>
			</label>
		{/each}
	</div>
</fieldset>
