<script lang="ts">
	import { Check } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { activityTypeOptions } from '$lib/i18n/labels';

	let {
		selected = $bindable('walk'),
		name = 'type',
		legend
	}: {
		selected?: string;
		name?: string;
		legend?: string;
	} = $props();

	const locale = getLocale();
	const EVENT_TYPES = activityTypeOptions(locale);
</script>

<fieldset class="space-y-2">
	<legend class="text-sm font-medium text-foreground"
		>{legend ?? t(locale, 'page.log.activityLabel')}</legend
	>
	<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
		{#each EVENT_TYPES as opt (opt.value)}
			<label class="cursor-pointer">
				<input type="radio" {name} value={opt.value} bind:group={selected} class="sr-only peer" />
				<span
					class="flex items-center justify-center gap-1 rounded-xl border px-3 py-3
				text-sm font-medium transition-all text-center
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
