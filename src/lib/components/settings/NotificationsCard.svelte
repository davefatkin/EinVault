<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		reminderEnabled,
		shiftEnabled,
		hasEmail,
		mailEnabled,
		ntfyEnabled,
		ntfyTopic,
		successMessage,
		errorMessage,
		testSuccessMessage,
		testErrorMessage
	}: {
		reminderEnabled: boolean;
		shiftEnabled: boolean;
		hasEmail: boolean;
		mailEnabled: boolean;
		ntfyEnabled: boolean;
		ntfyTopic: string | null;
		successMessage: string | undefined;
		errorMessage: string | undefined;
		testSuccessMessage: string | undefined;
		testErrorMessage: string | undefined;
	} = $props();

	const locale = getLocale();
	let formEl: HTMLFormElement;
	let submitting = $state(false);

	// Default enhance resets the form on success, snapping every control back
	// to its server-rendered attribute value before the invalidated data
	// arrives -- the checkbox flicker and the "topic field reverts" bug.
	// reset: false keeps the user's input; invalidation then syncs props.
	// The submitting flag disables controls so a second change cannot race an
	// in-flight save.
	const handleSubmit: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => {
			await update({ reset: false });
			submitting = false;
		};
	};

	const emailControlsDisabled = $derived(!hasEmail || submitting);
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
		{#if errorMessage}
			<Alert variant="destructive" class="mb-3">
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if mailEnabled && !hasEmail}
			<p class="text-sm text-muted-foreground mb-3">
				{t(locale, 'page.settings.notificationsNeedEmail')}
			</p>
		{/if}
		<form
			method="POST"
			action="?/notifications"
			bind:this={formEl}
			use:enhance={handleSubmit}
			class="space-y-2.5"
		>
			{#if mailEnabled}
				<label
					class="flex items-center gap-2.5 {!hasEmail ? 'opacity-50' : ''}"
					class:cursor-not-allowed={!hasEmail}
				>
					<input
						type="checkbox"
						name="notifyReminderEmail"
						checked={reminderEnabled}
						disabled={emailControlsDisabled}
						onchange={() => formEl.requestSubmit()}
						class="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed"
					/>
					<Label class={hasEmail ? 'cursor-pointer' : 'cursor-not-allowed'}
						>{t(locale, 'page.settings.notifyReminderEmailLabel')}</Label
					>
				</label>
				<label
					class="flex items-center gap-2.5 {!hasEmail ? 'opacity-50' : ''}"
					class:cursor-not-allowed={!hasEmail}
				>
					<input
						type="checkbox"
						name="notifyShiftEmail"
						checked={shiftEnabled}
						disabled={emailControlsDisabled}
						onchange={() => formEl.requestSubmit()}
						class="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed"
					/>
					<Label class={hasEmail ? 'cursor-pointer' : 'cursor-not-allowed'}
						>{t(locale, 'page.settings.notifyShiftEmailLabel')}</Label
					>
				</label>
				{#if !hasEmail}
					<!-- Disabled checkboxes do not submit; preserve stored flags. -->
					{#if reminderEnabled}<input type="hidden" name="notifyReminderEmail" value="on" />{/if}
					{#if shiftEnabled}<input type="hidden" name="notifyShiftEmail" value="on" />{/if}
				{/if}
			{:else}
				<!-- Email unconfigured: keep stored flags intact across topic edits. -->
				{#if reminderEnabled}<input type="hidden" name="notifyReminderEmail" value="on" />{/if}
				{#if shiftEnabled}<input type="hidden" name="notifyShiftEmail" value="on" />{/if}
			{/if}
			{#if ntfyEnabled}
				<div class="space-y-1.5 pt-2">
					<Label for="ntfyTopic">{t(locale, 'page.settings.ntfyTopicLabel')}</Label>
					<Input
						id="ntfyTopic"
						name="ntfyTopic"
						type="text"
						value={ntfyTopic ?? ''}
						maxlength={64}
						disabled={submitting}
						onchange={() => formEl.requestSubmit()}
					/>
					<p class="text-xs text-muted-foreground">
						{t(locale, 'page.settings.ntfyTopicHint')}
					</p>
				</div>
			{:else}
				<input type="hidden" name="ntfyTopic" value={ntfyTopic ?? ''} />
			{/if}
		</form>
		{#if testSuccessMessage}
			<Alert variant="success" class="mt-3">
				<AlertDescription>{testSuccessMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if testErrorMessage}
			<Alert variant="destructive" class="mt-3">
				<AlertDescription>{testErrorMessage}</AlertDescription>
			</Alert>
		{/if}
		{#if mailEnabled || ntfyEnabled}
			<div class="flex flex-wrap gap-2 pt-3">
				{#if mailEnabled}
					<form method="POST" action="?/testEmail" use:enhance={handleSubmit}>
						<Button type="submit" size="sm" variant="outline" disabled={!hasEmail || submitting}>
							{t(locale, 'page.settings.testEmail')}
						</Button>
					</form>
				{/if}
				{#if ntfyEnabled}
					<form method="POST" action="?/testNtfy" use:enhance={handleSubmit}>
						<Button type="submit" size="sm" variant="outline" disabled={!ntfyTopic || submitting}>
							{t(locale, 'page.settings.testNtfy')}
						</Button>
					</form>
				{/if}
			</div>
		{/if}
	</CardContent>
</Card>
