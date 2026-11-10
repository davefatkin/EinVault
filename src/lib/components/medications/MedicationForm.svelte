<script lang="ts">
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '#lib/components/MarkdownTextarea.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { MedicationFormValues } from '#lib/medications.js';

	// Add and edit form for a medication. Schedules are dose reminders, so
	// there are no time fields here.
	let {
		action,
		values,
		today,
		cancelHref,
		oncancel,
		onsaved
	}: {
		action: string;
		/** Starting values; a new medication starts today. */
		values?: MedicationFormValues | null;
		/** Local YYYY-MM-DD, from the server so SSR and hydration agree. */
		today: string;
		cancelHref?: string;
		oncancel?: () => void;
		/** Called after a successful save that stays on the page. */
		onsaved?: () => void;
	} = $props();
	const locale = getLocale();
	let submitting = $state(false);
</script>

<form
	method="POST"
	{action}
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			await update();
			submitting = false;
			if (result.type === 'success') onsaved?.();
		};
	}}
	class="space-y-4"
>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="med-name">{t(locale, 'page.medications.labelName')}</Label>
			<Input
				id="med-name"
				name="name"
				type="text"
				autocomplete="off"
				required
				placeholder={t(locale, 'page.medications.placeholderName')}
				value={values?.name ?? ''}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="med-dose">{t(locale, 'page.medications.labelDose')}</Label>
			<Input
				id="med-dose"
				name="dose"
				type="text"
				autocomplete="off"
				placeholder={t(locale, 'page.medications.placeholderDose')}
				value={values?.dose ?? ''}
			/>
		</div>
	</div>
	<div class="space-y-1.5">
		<Label for="med-instructions">{t(locale, 'page.medications.labelInstructions')}</Label>
		<MarkdownTextarea
			id="med-instructions"
			name="instructions"
			rows={3}
			placeholder={t(locale, 'page.medications.placeholderInstructions')}
			value={values?.instructions ?? ''}
		/>
	</div>
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
		<div class="space-y-1.5">
			<Label for="med-startedOn">{t(locale, 'page.medications.labelStartedOn')}</Label>
			<Input
				id="med-startedOn"
				name="startedOn"
				type="date"
				required
				value={values?.startedOn ?? today}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="med-endedOn">{t(locale, 'page.medications.labelEndedOn')}</Label>
			<Input
				id="med-endedOn"
				name="endedOn"
				type="date"
				aria-describedby="med-endedOn-hint"
				value={values?.endedOn ?? ''}
			/>
			<p id="med-endedOn-hint" class="text-xs text-muted-foreground">
				{t(locale, 'page.medications.endedOnHint')}
			</p>
		</div>
	</div>
	<div class="flex flex-wrap gap-3">
		<Button type="submit" disabled={submitting}>
			{submitting ? t(locale, 'common.saving') : t(locale, 'page.medications.save')}
		</Button>
		{#if cancelHref}
			<Button variant="outline" href={cancelHref}>{t(locale, 'common.cancel')}</Button>
		{:else if oncancel}
			<Button type="button" variant="outline" onclick={oncancel}
				>{t(locale, 'common.cancel')}</Button
			>
		{/if}
	</div>
</form>
