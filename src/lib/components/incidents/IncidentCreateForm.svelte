<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import IncidentForm from './IncidentForm.svelte';
	import { incidentMediaApi, uploadEach } from '#lib/mediaApi.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// The create form with its save-then-upload flow, shared by the new-incident
	// screens (owner Health Log, caretaker care page) and the journal day modal.
	// The action returns { id, reminderUrl? } when asked with afterSave=client.
	let {
		companionId,
		action = '?/create',
		nextHref,
		onfinish,
		oncancel,
		beforeSubmit,
		defaultStart,
		allowStart,
		showReminder = false,
		uploadMaxMb,
		videoMaxMb,
		formError
	}: {
		companionId: string;
		action?: string;
		/** Where the incident lives; a reminder prefill URL wins over it. */
		nextHref: (id: string) => string;
		/** Called with the target URL once the incident and its files are saved. */
		onfinish: (url: string) => void | Promise<void>;
		oncancel: () => void;
		/** Runs before the POST; throwing keeps the form open with a generic error. */
		beforeSubmit?: () => Promise<void>;
		/** Start the form opens with (owners only). */
		defaultStart?: Date;
		/** Owners set the start; caretakers log "now". */
		allowStart: boolean;
		showReminder?: boolean;
		uploadMaxMb: number;
		videoMaxMb: number;
		/** The action's error when the form was posted without JavaScript. */
		formError?: string | null;
	} = $props();
	const locale = getLocale();
	// Read once, like the form: a refresh must not move a start typed by hand.
	const values = untrack(() =>
		defaultStart ? { title: '', notes: null, severity: null, occurredAt: defaultStart } : undefined
	);

	let phase = $state<'form' | 'saving' | 'failed'>('form');
	let error = $state<string | null>(null);
	let files = $state<File[]>([]);
	let failures = $state<{ name: string; message: string }[]>([]);
	let nextUrl = $state('');

	// Same order as the journal day's health event modal: save the incident,
	// then upload the picked files to its overview, then move on. The incident
	// stays saved if an upload fails; each failure is listed by name.
	const submit: SubmitFunction = async ({ formData, cancel }) => {
		if (phase !== 'form') {
			cancel();
			return;
		}
		formData.set('afterSave', 'client');
		phase = 'saving';
		error = null;
		try {
			await beforeSubmit?.();
		} catch {
			phase = 'form';
			error = t(locale, 'media.actionFailed');
			cancel();
			return;
		}
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				phase = 'form';
				error = String(result.data?.error ?? t(locale, 'media.actionFailed'));
				return;
			}
			if (result.type !== 'success' || !result.data) {
				phase = 'form';
				await update();
				return;
			}
			const saved = result.data as { id: string; reminderUrl?: string | null };
			nextUrl = saved.reminderUrl ?? nextHref(saved.id);
			const failed =
				files.length > 0
					? await uploadEach(incidentMediaApi(companionId, saved.id, null, locale), files)
					: [];
			if (failed.length > 0) {
				failures = failed;
				phase = 'failed';
				return;
			}
			await onfinish(nextUrl);
		};
	};
</script>

{#if phase === 'failed'}
	<div class="space-y-3 rounded-2xl border bg-card p-5 text-sm">
		<p role="alert">{t(locale, 'page.incident.filesFailed')}</p>
		<ul class="list-disc space-y-1 pl-5 text-destructive">
			{#each failures as f, i (i)}
				<li>{t(locale, 'page.journal.day.fileFailed', { name: f.name, message: f.message })}</li>
			{/each}
		</ul>
		<Button onclick={() => onfinish(nextUrl)}>{t(locale, 'page.incident.continue')}</Button>
	</div>
{:else}
	{#if error ?? formError}
		<Alert variant="coral"><AlertDescription>{error ?? formError}</AlertDescription></Alert>
	{/if}
	<div class="rounded-2xl border bg-card p-5">
		<IncidentForm
			{action}
			{submit}
			{allowStart}
			submitting={phase === 'saving'}
			submitLabel={t(locale, 'page.incident.save')}
			onfiles={(f) => (files = f)}
			mediaHint={t(locale, 'media.types', { imgMax: uploadMaxMb, vidMax: videoMaxMb })}
			{showReminder}
			{oncancel}
			{values}
		/>
	</div>
{/if}
