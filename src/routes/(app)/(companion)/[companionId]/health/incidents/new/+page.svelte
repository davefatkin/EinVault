<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { goto } from '$app/navigation';
	import { Bandage, ChevronLeft } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import IncidentForm from '#lib/components/incidents/IncidentForm.svelte';
	import { incidentMediaApi, uploadEach } from '#lib/mediaApi.js';
	import { incidentPath } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();

	const healthHref = $derived(`/${data.companion.id}/health`);
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
			const saved = result.data as { id: string; reminderUrl: string | null };
			const companionId = data.companion.id;
			nextUrl = saved.reminderUrl ?? incidentPath(companionId, saved.id);
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

<svelte:head>
	<title>{t(locale, 'page.incident.newTitle')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={healthHref}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{t(locale, 'page.health.title')}
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
		{#if error ?? form?.error}
			<Alert variant="coral"><AlertDescription>{error ?? form?.error}</AlertDescription></Alert>
		{/if}
		<div class="rounded-2xl border bg-card p-5">
			<IncidentForm
				action="?/create"
				{submit}
				allowStart
				submitting={phase === 'saving'}
				submitLabel={t(locale, 'page.incident.save')}
				onfiles={(f) => (files = f)}
				mediaHint={t(locale, 'media.types', {
					imgMax: data.uploadMaxMb,
					vidMax: data.videoMaxMb
				})}
				showReminder
				oncancel={() => goto(healthHref)}
			/>
		</div>
	{/if}
</div>
