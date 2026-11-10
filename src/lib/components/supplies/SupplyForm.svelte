<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import LeadDaysPicker from '#lib/components/reminders/LeadDaysPicker.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { SupplyCompanionOption, SupplyFormValues } from '#lib/supplies.js';

	// Add and edit form for a supply. The kind is chosen on create and fixed
	// after (the edit form posts it back as a hidden field). Starting stock is
	// create only; later stock changes are purchases and corrections.
	let {
		action,
		values = null,
		editing = false,
		companions,
		companionId,
		today,
		cancelHref
	}: {
		action: string;
		/** Starting values; a new supply starts empty, linked to this pet. */
		values?: SupplyFormValues | null;
		editing?: boolean;
		companions: SupplyCompanionOption[];
		/** The pet whose page this is, checked on a new supply. */
		companionId: string;
		/** Local YYYY-MM-DD, from the server so SSR and hydration agree. */
		today: string;
		cancelHref: string;
	} = $props();
	const locale = getLocale();

	// The form seeds its fields once; parents key it to start over.
	// svelte-ignore state_referenced_locally
	const initial = values;
	let kind = $state(initial?.kind === 'duration' ? 'duration' : 'counted');
	let runOutLeadDays = $state(initial?.runOutLeadDays ?? [7]);
	let expiryLeadDays = $state(initial?.expiryLeadDays ?? [14]);
	// svelte-ignore state_referenced_locally
	const checked = new Set(initial?.companionIds ?? [companionId]);
	let submitting = $state(false);

	const field = 'space-y-1.5';
	const hint = 'text-xs text-muted-foreground';
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	}}
	class="space-y-5"
>
	<div class={field}>
		<Label for="supply-name">{t(locale, 'page.supplies.labelName')}</Label>
		<Input
			id="supply-name"
			name="name"
			type="text"
			autocomplete="off"
			required
			maxlength={200}
			placeholder={t(locale, 'page.supplies.placeholderName')}
			value={initial?.name ?? ''}
		/>
	</div>

	{#if editing}
		<input type="hidden" name="kind" value={kind} />
		<p class={hint}>
			{t(locale, kind === 'counted' ? 'page.supplies.kindCounted' : 'page.supplies.kindDuration')}.
			{t(locale, 'page.supplies.kindFixedHint')}
		</p>
	{:else}
		<fieldset class="space-y-2">
			<legend class="text-sm font-medium text-foreground">
				{t(locale, 'page.supplies.labelKind')}
			</legend>
			<div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
				{#each ['counted', 'duration'] as const as option (option)}
					<label
						class="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors
						{kind === option ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40'}"
					>
						<input
							id="supply-kind-{option}"
							type="radio"
							name="kind"
							value={option}
							bind:group={kind}
							class="mt-0.5"
						/>
						<span class="space-y-0.5">
							<span class="block font-medium text-foreground">
								{t(
									locale,
									option === 'counted' ? 'page.supplies.kindCounted' : 'page.supplies.kindDuration'
								)}
							</span>
							<span class="block {hint}">
								{t(
									locale,
									option === 'counted'
										? 'page.supplies.kindCountedHint'
										: 'page.supplies.kindDurationHint'
								)}
							</span>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>
	{/if}

	{#if kind === 'counted'}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class={field}>
				<Label for="supply-unit">{t(locale, 'page.supplies.labelUnit')}</Label>
				<Input
					id="supply-unit"
					name="unit"
					type="text"
					autocomplete="off"
					maxlength={50}
					placeholder={t(locale, 'page.supplies.placeholderUnit')}
					value={initial?.unit ?? ''}
				/>
			</div>
			{#if !editing}
				<div class={field}>
					<Label for="supply-startingQuantity"
						>{t(locale, 'page.supplies.labelStartingQuantity')}</Label
					>
					<Input
						id="supply-startingQuantity"
						name="startingQuantity"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						value={initial?.startingQuantity ?? ''}
					/>
				</div>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class={field}>
				<Label for="supply-lastsDays">{t(locale, 'page.supplies.labelLastsDays')}</Label>
				<Input
					id="supply-lastsDays"
					name="lastsDays"
					type="number"
					min={1}
					max={365}
					step={1}
					required
					value={initial?.lastsDays ?? ''}
				/>
			</div>
			{#if !editing}
				<div class={field}>
					<Label for="supply-firstPurchaseDate"
						>{t(locale, 'page.supplies.labelFirstPurchaseDate')}</Label
					>
					<Input
						id="supply-firstPurchaseDate"
						name="firstPurchaseDate"
						type="date"
						max={today}
						aria-describedby="supply-firstPurchaseDate-hint"
						value={initial?.firstPurchaseDate ?? ''}
					/>
					<p id="supply-firstPurchaseDate-hint" class={hint}>
						{t(locale, 'page.supplies.firstPurchaseHint')}
					</p>
				</div>
			{/if}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class={field}>
			<Label for="supply-expiresOn">{t(locale, 'page.supplies.labelExpiresOn')}</Label>
			<Input id="supply-expiresOn" name="expiresOn" type="date" value={initial?.expiresOn ?? ''} />
		</div>
	</div>

	<fieldset class="space-y-2">
		<legend class="text-sm font-medium text-foreground">
			{t(locale, 'page.supplies.labelPets')}
		</legend>
		<div class="flex flex-wrap gap-x-5 gap-y-2">
			{#each companions as companion (companion.id)}
				<label class="flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						name="companionIds"
						value={companion.id}
						checked={checked.has(companion.id)}
						class="rounded border-input"
					/>
					{companion.isActive
						? companion.name
						: t(locale, 'page.supplies.archivedPet', { name: companion.name })}
				</label>
			{/each}
		</div>
	</fieldset>

	<div class={field}>
		<Label for="supply-notes">{t(locale, 'page.supplies.labelNotes')}</Label>
		<Textarea id="supply-notes" name="notes" rows={3} value={initial?.notes ?? ''} />
	</div>

	<fieldset class="space-y-3 rounded-xl border p-4">
		<legend class="px-1 text-sm font-semibold text-foreground">
			{t(locale, 'page.supplies.warnings')}
		</legend>
		<label class="flex cursor-pointer items-start gap-2 text-sm text-foreground">
			<input
				id="supply-alertsEnabled"
				type="checkbox"
				name="alertsEnabled"
				checked={initial?.alertsEnabled ?? true}
				class="mt-0.5 rounded border-input"
				aria-describedby="supply-alerts-hint"
			/>
			<span>
				{t(locale, 'page.supplies.labelAlertsEnabled')}
				<span id="supply-alerts-hint" class="block {hint}"
					>{t(locale, 'page.supplies.alertsHint')}</span
				>
			</span>
		</label>
		<!-- Shown with warnings off too: these timings also drive the badges. -->
		<div class="space-y-4">
			<LeadDaysPicker
				bind:value={runOutLeadDays}
				name="runOutLeadDays"
				label={t(locale, 'page.supplies.runOutLead')}
			/>
			<LeadDaysPicker
				bind:value={expiryLeadDays}
				name="expiryLeadDays"
				label={t(locale, 'page.supplies.expiryLead')}
			/>
			{#if kind === 'counted'}
				<div class="{field} sm:max-w-xs">
					<Label for="supply-lowStockAt">{t(locale, 'page.supplies.labelLowStockAt')}</Label>
					<Input
						id="supply-lowStockAt"
						name="lowStockAt"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						aria-describedby="supply-lowStockAt-hint"
						value={initial?.lowStockAt ?? ''}
					/>
					<p id="supply-lowStockAt-hint" class={hint}>
						{t(locale, 'page.supplies.lowStockHint')}
					</p>
				</div>
			{/if}
		</div>
	</fieldset>

	<div class="flex flex-wrap gap-3">
		<Button type="submit" disabled={submitting}>
			{submitting ? t(locale, 'common.saving') : t(locale, 'page.supplies.save')}
		</Button>
		<Button variant="outline" href={cancelHref}>{t(locale, 'common.cancel')}</Button>
	</div>
</form>
