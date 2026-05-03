<script lang="ts">
	import { enhance } from '$app/forms';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';
	import { REMINDER_UNDO_DEFAULT_SENTINEL, REMINDER_UNDO_PRESETS } from '$lib/reminderUndo';

	let {
		currentValue,
		defaultSeconds,
		successMessage,
		errorMessage
	}: {
		currentValue: number | null;
		defaultSeconds: number;
		successMessage: string | undefined;
		errorMessage: string | undefined;
	} = $props();

	const locale = getLocale();
	let formEl: HTMLFormElement;

	const options = $derived(
		Array.from(new Set([...REMINDER_UNDO_PRESETS, defaultSeconds])).sort((a, b) => a - b)
	);

	const selectValue = $derived(
		currentValue == null ? REMINDER_UNDO_DEFAULT_SENTINEL : String(currentValue)
	);
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.reminderUndoCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		<p class="text-sm text-muted-foreground mb-3">
			{t(locale, 'page.settings.reminderUndoDescription')}
		</p>
		{#if successMessage}
			<Alert variant="success" class="mb-3">
				<AlertDescription>{successMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if errorMessage}
			<Alert variant="destructive" class="mb-3">
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		{/if}
		<form method="POST" action="?/reminderUndo" bind:this={formEl} use:enhance>
			<div class="max-w-[280px]">
				<Label for="reminderUndoSeconds" class="sr-only"
					>{t(locale, 'page.settings.reminderUndoLabel')}</Label
				>
				<Select
					name="reminderUndoSeconds"
					id="reminderUndoSeconds"
					value={selectValue}
					onchange={() => formEl.requestSubmit()}
				>
					<option value={REMINDER_UNDO_DEFAULT_SENTINEL}
						>{t(locale, 'page.settings.reminderUndoDefault', {
							seconds: defaultSeconds
						})}</option
					>
					{#each options as preset (preset)}
						<option value={String(preset)}>
							{preset === 0
								? t(locale, 'page.settings.reminderUndoOff')
								: t(locale, 'page.settings.reminderUndoSeconds', { seconds: preset })}
						</option>
					{/each}
				</Select>
			</div>
		</form>
	</CardContent>
</Card>
