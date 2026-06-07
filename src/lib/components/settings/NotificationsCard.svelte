<script lang="ts">
	import { enhance } from '$app/forms';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		reminderEnabled,
		shiftEnabled,
		hasEmail,
		successMessage
	}: {
		reminderEnabled: boolean;
		shiftEnabled: boolean;
		hasEmail: boolean;
		successMessage: string | undefined;
	} = $props();

	const locale = getLocale();
	let formEl: HTMLFormElement;
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.notificationsCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		<p class="text-sm text-muted-foreground mb-3">
			{t(locale, 'page.settings.notificationsDescription')}
		</p>
		{#if successMessage}
			<Alert variant="success" class="mb-3">
				<AlertDescription>{successMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if !hasEmail}
			<p class="text-sm text-muted-foreground mb-3">
				{t(locale, 'page.settings.notificationsNeedEmail')}
			</p>
		{/if}
		<form method="POST" action="?/notifications" bind:this={formEl} use:enhance class="space-y-2.5">
			<label class="flex items-center gap-2.5">
				<input
					type="checkbox"
					name="notifyReminderEmail"
					checked={reminderEnabled}
					disabled={!hasEmail}
					onchange={() => formEl.requestSubmit()}
					class="h-4 w-4 rounded border-input accent-primary"
				/>
				<Label class="cursor-pointer">{t(locale, 'page.settings.notifyReminderEmailLabel')}</Label>
			</label>
			<label class="flex items-center gap-2.5">
				<input
					type="checkbox"
					name="notifyShiftEmail"
					checked={shiftEnabled}
					disabled={!hasEmail}
					onchange={() => formEl.requestSubmit()}
					class="h-4 w-4 rounded border-input accent-primary"
				/>
				<Label class="cursor-pointer">{t(locale, 'page.settings.notifyShiftEmailLabel')}</Label>
			</label>
		</form>
	</CardContent>
</Card>
