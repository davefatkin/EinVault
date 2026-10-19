<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { WEIGHT_UNITS, type WeightUnit } from '$lib/activityTypes';

	// The log-weight form, shared by the Health Log and the journal day.
	let {
		action,
		submit,
		defaultAt,
		submitting,
		defaultUnit,
		oncancel
	}: {
		action: string;
		submit: SubmitFunction;
		defaultAt: string;
		submitting: boolean;
		defaultUnit: WeightUnit;
		oncancel: () => void;
	} = $props();
	const locale = getLocale();
</script>

<form method="POST" {action} use:localDatetimes use:enhance={submit} class="space-y-4">
	<div class="grid grid-cols-3 gap-4">
		<div class="space-y-1.5 col-span-2">
			<Label for="weight">{t(locale, 'page.health.labelWeight')}</Label>
			<Input
				id="weight"
				name="weight"
				type="number"
				step="0.1"
				min="0"
				autocomplete="off"
				placeholder={t(locale, 'page.health.placeholderWeight')}
				required
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="unit">{t(locale, 'page.health.labelUnit')}</Label>
			<Select id="unit" name="unit">
				{#each WEIGHT_UNITS as u (u)}
					<option value={u} selected={u === defaultUnit}>{u}</option>
				{/each}
			</Select>
		</div>
	</div>
	<div class="space-y-1.5">
		<Label for="recordedAt">{t(locale, 'page.health.labelRecordedAt')}</Label>
		<Input
			id="recordedAt"
			name="recordedAt"
			type="datetime-local"
			autocomplete="off"
			value={defaultAt}
		/>
	</div>
	<div class="space-y-1.5">
		<Label for="weightNotes">{t(locale, 'page.health.labelNotes')}</Label>
		<MarkdownTextarea
			id="weightNotes"
			name="notes"
			placeholder={t(locale, 'page.health.placeholderWeightNotes')}
			rows={3}
		/>
	</div>
	<div class="flex gap-3">
		<Button type="submit" disabled={submitting}>
			{submitting
				? t(locale, 'page.health.savingWeight')
				: t(locale, 'page.health.logWeightSubmit')}
		</Button>
		<Button type="button" variant="outline" disabled={submitting} onclick={oncancel}
			>{t(locale, 'common.cancel')}</Button
		>
	</div>
</form>
