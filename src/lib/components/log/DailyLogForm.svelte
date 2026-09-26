<script lang="ts">
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Check } from '@lucide/svelte';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { activityTypeOptions, ACTIVITY_HAS_DURATION } from '$lib/i18n/labels';
	import type { DailyEventType, Species } from '$lib/activityTypes';
	import {
		SPECIES_ACTIVITY_TYPES,
		allowedTypesFor,
		defaultActivityType,
		isActivityAllowed
	} from '$lib/species';
	import ActivityTypePills from '$lib/components/log/ActivityTypePills.svelte';
	import SubtypePills from '$lib/components/log/SubtypePills.svelte';

	interface CompanionOption {
		id: string;
		name: string;
		species: Species;
	}

	// primaryCompanion set → it is the implicit target (route param) and the other
	// companions render as "Also log for" pills. null → "free" mode (dashboard):
	// all companions render as required target checkboxes named companionIds.
	let {
		companions = [],
		primaryCompanion = null,
		initialType = null,
		action = '?/add',
		form
	}: {
		companions?: CompanionOption[];
		primaryCompanion?: CompanionOption | null;
		initialType?: string | null;
		action?: string;
		form: { success?: boolean; error?: string } | null;
	} = $props();

	const locale = getLocale();

	// Primary companion → its species' list. Free mode (dashboard) → the union
	// over every offered companion. Captured once on purpose: callers key this
	// component by companion id, so it remounts on navigation.
	// svelte-ignore state_referenced_locally
	const typeList = primaryCompanion
		? SPECIES_ACTIVITY_TYPES[primaryCompanion.species]
		: allowedTypesFor(companions.map((c) => c.species));

	// Intentionally captures the initial prop value: the type pre-selection comes
	// from the ?type= query param on first render and the pills own it afterwards.
	// A type the species can't take falls back to the species default.
	// svelte-ignore state_referenced_locally
	let selectedType = $state(
		initialType && (typeList as readonly string[]).includes(initialType)
			? initialType
			: primaryCompanion
				? defaultActivityType(primaryCompanion.species)
				: typeList[0]
	);
	let duration = $state('');
	let notes = $state('');
	let subtypes = $state<string[]>([]);

	let siblingCompanions = $derived(
		primaryCompanion
			? companions.filter(
					(c) => c.id !== primaryCompanion!.id && isActivityAllowed(c.species, selectedType)
				)
			: []
	);
	// Free mode: only companions that can take the selected type are offered.
	let targetCompanions = $derived(
		primaryCompanion ? [] : companions.filter((c) => isActivityAllowed(c.species, selectedType))
	);
	let selectedAdditionalIds = $state<string[]>([]);
	let selectedCompanionIds = $state<string[]>([]);
	// Drop selections whose companion is no longer offered for the selected type.
	$effect(() => {
		const ok = (ids: string[], list: CompanionOption[]) =>
			ids.filter((id) => list.some((c) => c.id === id));
		const a = ok(selectedAdditionalIds, siblingCompanions);
		if (a.length !== selectedAdditionalIds.length) selectedAdditionalIds = a;
		const b = ok(selectedCompanionIds, targetCompanions);
		if (b.length !== selectedCompanionIds.length) selectedCompanionIds = b;
	});
	let hasDuration = $derived(ACTIVITY_HAS_DURATION[selectedType as DailyEventType] ?? false);

	function defaultLoggedAt() {
		const now = new Date();
		const offset = now.getTimezoneOffset() * 60000;
		return new Date(now.getTime() - offset).toISOString().slice(0, 16);
	}

	// svelte-ignore state_referenced_locally
	const TYPE_PILL_LABELS: Record<string, string> = Object.fromEntries(
		activityTypeOptions(locale, typeList, primaryCompanion?.species).map((t) => [
			t.value,
			`${t.icon} ${t.label}`
		])
	);
</script>

{#if form?.success}
	<div
		role="status"
		class="rounded-lg border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal animate-fade-in"
	>
		{t(locale, 'page.log.activityLogged')}
	</div>
{/if}

{#if form?.error}
	<div
		role="alert"
		class="rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
	>
		{form.error}
	</div>
{/if}

<form
	method="POST"
	{action}
	use:localDatetimes
	use:enhance={() =>
		async ({ result, update }) => {
			await update({ reset: false });
			if (result.type === 'success') {
				duration = '';
				notes = '';
				subtypes = [];
				selectedAdditionalIds = [];
				selectedCompanionIds = [];
			}
		}}
	class="space-y-4"
>
	<ActivityTypePills
		types={typeList}
		bind:selected={selectedType}
		species={primaryCompanion?.species}
	/>

	<SubtypePills type={selectedType} bind:selected={subtypes} species={primaryCompanion?.species} />

	{#if !primaryCompanion}
		<fieldset class="space-y-1.5">
			<legend class="text-sm font-medium text-foreground"
				>{t(locale, 'page.log.selectCompanions')}</legend
			>
			<div class="flex flex-wrap gap-2">
				{#each targetCompanions as companion (companion.id)}
					{@const checked = selectedCompanionIds.includes(companion.id)}
					<label class="cursor-pointer">
						<input
							type="checkbox"
							name="companionIds"
							value={companion.id}
							bind:group={selectedCompanionIds}
							class="sr-only peer"
						/>
						<span
							class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
							peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
							{checked
								? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{#if checked}
								<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							{/if}
							{companion.name}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{:else if siblingCompanions.length > 0}
		<fieldset class="space-y-1.5">
			<legend class="text-sm font-medium text-foreground">{t(locale, 'page.log.alsoLogFor')}</legend
			>
			<p class="text-xs text-muted-foreground">
				{t(locale, 'page.log.alsoLogForHint')}
			</p>
			<div class="flex flex-wrap gap-2">
				{#each siblingCompanions as sibling (sibling.id)}
					{@const checked = selectedAdditionalIds.includes(sibling.id)}
					<label class="cursor-pointer">
						<input
							type="checkbox"
							name="additionalCompanionIds"
							value={sibling.id}
							bind:group={selectedAdditionalIds}
							class="sr-only peer"
						/>
						<span
							class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
							peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
							{checked
								? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{#if checked}
								<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							{/if}
							{sibling.name}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if hasDuration}
		<div class="space-y-1.5 animate-slide-up">
			<Label for="duration">{t(locale, 'page.log.durationLabel')}</Label>
			<div class="flex gap-2">
				{#each [15, 30, 45, 60] as mins (mins)}
					<Button
						type="button"
						variant="outline"
						size="sm"
						onclick={() => (duration = String(mins))}>{mins}m</Button
					>
				{/each}
				<input
					id="duration"
					name="durationMinutes"
					type="number"
					min="1"
					max="480"
					autocomplete="off"
					bind:value={duration}
					class="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					placeholder="30"
				/>
			</div>
		</div>
	{/if}

	<div class="space-y-1.5">
		<Label for="loggedAt">{t(locale, 'page.log.whenLabel')}</Label>
		<input
			id="loggedAt"
			name="loggedAt"
			autocomplete="off"
			type="datetime-local"
			value={defaultLoggedAt()}
			class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		/>
	</div>

	<div class="space-y-1.5">
		<Label for="notes"
			>{t(locale, 'page.log.notesLabel')}
			<span class="font-normal text-muted-foreground">{t(locale, 'page.log.notesOptional')}</span
			></Label
		>
		<MarkdownTextarea
			id="notes"
			name="notes"
			bind:value={notes}
			placeholder={t(locale, 'page.log.notesPlaceholder')}
			rows={3}
		/>
	</div>

	<Button
		type="submit"
		class="w-full text-base"
		size="lg"
		disabled={!primaryCompanion && selectedCompanionIds.length === 0}
	>
		{t(locale, 'page.log.logButton', {
			activity: TYPE_PILL_LABELS[selectedType] ?? selectedType
		})}
	</Button>
</form>
