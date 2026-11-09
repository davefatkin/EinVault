<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Bandage, ChevronLeft } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import IncidentForm from './IncidentForm.svelte';
	import { incidentMediaApi, uploadEach } from '#lib/mediaApi.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// The new-incident screen, shared by the owner Health Log and the caretaker
	// care page. The page's `create` action returns { id, reminderUrl? } when
	// asked with afterSave=client.
	let {
		companionId,
		backHref,
		backLabel,
		nextHref,
		allowStart,
		showReminder = false,
		uploadMaxMb,
		videoMaxMb,
		formError
	}: {
		companionId: string;
		backHref: string;
		backLabel: string;
		/** Where to go once the incident and its files are saved. */
		nextHref: (id: string) => string;
		/** Owners set the start; caretakers log "now". */
		allowStart: boolean;
		showReminder?: boolean;
		uploadMaxMb: number;
		videoMaxMb: number;
		/** The action's error when the form was posted without JavaScript. */
		formError?: string | null;
	} = $props();
	const locale = getLocale();

	let phase = $state<'form' | 'saving' | 'failed'>('form');
	let error = $state<string | null>(null);
	let files = $state<File[]>([]);
	let failures = $state<{ name: string; message: string }[]>([]);
	let nextUrl = $state('');

	// Same order as the journal day's health event modal: save the incident,
	// then upload the picked files to its overview, then move on. The incident
	// stays saved if an upload fails; each failure is listed by name.
	const submit: SubmitFunction = ({ formData, cancel }) => {
		if (phase !== 'form') {
			cancel();
			return;
		}
		formData.set('afterSave', 'client');
		phase = 'saving';
		error = null;
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
			await goto(nextUrl);
		};
	};
</script>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={backHref}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{backLabel}
	</a>
	<PageHeader title={t(locale, 'page.incident.newTitle')} tint="teal">
		{#snippet icon()}<Bandage class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if phase === 'failed'}
		<div class="space-y-3 rounded-2xl border bg-card p-5 text-sm">
			<p role="alert">{t(locale, 'page.incident.filesFailed')}</p>
			<ul class="list-disc space-y-1 pl-5 text-destructive">
				{#each failures as f, i (i)}
					<li>{t(locale, 'page.journal.day.fileFailed', { name: f.name, message: f.message })}</li>
				{/each}
			</ul>
			<Button onclick={() => goto(nextUrl)}>{t(locale, 'page.incident.continue')}</Button>
		</div>
	{:else}
		{#if error ?? formError}
			<Alert variant="coral"><AlertDescription>{error ?? formError}</AlertDescription></Alert>
		{/if}
		<div class="rounded-2xl border bg-card p-5">
			<IncidentForm
				action="?/create"
				{submit}
				{allowStart}
				submitting={phase === 'saving'}
				submitLabel={t(locale, 'page.incident.save')}
				onfiles={(f) => (files = f)}
				mediaHint={t(locale, 'media.types', { imgMax: uploadMaxMb, vidMax: videoMaxMb })}
				{showReminder}
				oncancel={() => goto(backHref)}
			/>
		</div>
	{/if}
</div>
