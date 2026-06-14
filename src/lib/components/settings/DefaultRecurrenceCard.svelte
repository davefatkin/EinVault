<script lang="ts">
	import { enhance } from '$app/forms';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';
	import type { RecurrenceUnit } from '$lib/reminderRecurrence';

	let {
		currentValue,
		successMessage,
		errorMessage
	}: {
		currentValue: RecurrenceUnit | null;
		successMessage: string | undefined;
		errorMessage: string | undefined;
	} = $props();

	const locale = getLocale();
	let formEl: HTMLFormElement;

	const selectValue = $derived(currentValue ?? 'system');
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.defaultRecurrenceCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		<p class="text-sm text-muted-foreground mb-3">
			{t(locale, 'page.settings.defaultRecurrenceDescription')}
		</p>
		{#if successMessage}
			<Alert variant="success" class="mb-3">
				<AlertDescription>{successMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if errorMessage}
			<Alert variant="coral" class="mb-3">
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		{/if}
		<form method="POST" action="?/defaultRecurrence" bind:this={formEl} use:enhance>
			<div class="max-w-[260px]">
				<Label for="defaultRecurrenceUnit" class="sr-only"
					>{t(locale, 'page.settings.defaultRecurrenceLabel')}</Label
				>
				<Select
					name="defaultRecurrenceUnit"
					id="defaultRecurrenceUnit"
					value={selectValue}
					onchange={() => formEl.requestSubmit()}
				>
					<option value="system">{t(locale, 'page.settings.defaultRecurrenceSystem')}</option>
					<option value="day">{t(locale, 'page.reminders.unitDay')}</option>
					<option value="week">{t(locale, 'page.reminders.unitWeek')}</option>
					<option value="month">{t(locale, 'page.reminders.unitMonth')}</option>
					<option value="year">{t(locale, 'page.reminders.unitYear')}</option>
				</Select>
			</div>
		</form>
	</CardContent>
</Card>
