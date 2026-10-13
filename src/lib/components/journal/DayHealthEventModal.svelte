<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { goto, invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import HealthEventForm from '$lib/components/health/HealthEventForm.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { DOCUMENT_ACCEPT, attachDocument, uploadDocument } from '$lib/documentsApi';
	import type { AttachableDocument } from '$lib/dayItems';
	import { t, getLocale } from '$lib/i18n';

	// "+ Health event" on the journal day. Saves the event through ?/addHealth,
	// then uploads new files and attaches picked documents to it. The event
	// stays saved if any of those fail; each failure is listed by name.
	let {
		companionId,
		defaultAt,
		documents,
		uploadMaxMb,
		flush,
		onclose
	}: {
		companionId: string;
		defaultAt: string;
		documents: AttachableDocument[];
		uploadMaxMb: number;
		flush: () => Promise<void>;
		onclose: () => void;
	} = $props();
	const locale = getLocale();

	let phase = $state<'form' | 'saving' | 'failed'>('form');
	let error = $state<string | null>(null);
	let files = $state<File[]>([]);
	let picked = $state<string[]>([]);
	let failures = $state<{ name: string; message: string }[]>([]);
	let reminderUrl = $state<string | null>(null);

	async function attachAll(healthEventId: string, day: string) {
		const failed: { name: string; message: string }[] = [];
		for (const file of files) {
			const r = await uploadDocument(
				companionId,
				file,
				{ healthEventId, documentDate: day },
				locale
			);
			if (!r.ok) failed.push({ name: file.name, message: r.message });
		}
		for (const id of picked) {
			const r = await attachDocument(companionId, id, healthEventId, locale);
			if (!r.ok)
				failed.push({ name: documents.find((d) => d.id === id)?.title ?? id, message: r.message });
		}
		return failed;
	}

	const submit: SubmitFunction = async () => {
		await flush();
		phase = 'saving';
		error = null;
		return async ({ result }) => {
			if (result.type !== 'success' || !result.data) {
				phase = 'form';
				error =
					result.type === 'failure'
						? String(result.data?.healthError ?? t(locale, 'media.actionFailed'))
						: t(locale, 'media.actionFailed');
				return;
			}
			const saved = result.data as {
				healthEventId: string;
				day: string;
				reminderUrl: string | null;
			};
			const failed = await attachAll(saved.healthEventId, saved.day);
			await invalidateAll();
			if (failed.length === 0) {
				if (saved.reminderUrl) await goto(saved.reminderUrl);
				else onclose();
				return;
			}
			failures = failed;
			reminderUrl = saved.reminderUrl;
			phase = 'failed';
		};
	};
</script>

<Modal title={t(locale, 'page.health.newHealthEventTitle')} {onclose} locked={phase === 'saving'}>
	{#if phase === 'failed'}
		<div class="space-y-3 text-sm">
			<p role="alert">{t(locale, 'page.journal.day.attachFailedTitle')}</p>
			<ul class="list-disc space-y-1 pl-5 text-destructive">
				{#each failures as f, i (i)}
					<li>{t(locale, 'page.journal.day.fileFailed', { name: f.name, message: f.message })}</li>
				{/each}
			</ul>
			<div class="flex flex-wrap gap-3 pt-1">
				{#if reminderUrl}
					<Button onclick={() => reminderUrl && goto(reminderUrl)}
						>{t(locale, 'page.journal.day.continueToReminder')}</Button
					>
				{/if}
				<Button variant="outline" onclick={onclose}>{t(locale, 'common.close')}</Button>
			</div>
		</div>
	{:else}
		{#if error}
			<p role="alert" class="mb-3 text-sm text-destructive">{error}</p>
		{/if}
		<HealthEventForm
			action="?/addHealth"
			{defaultAt}
			{submit}
			submitting={phase === 'saving'}
			oncancel={onclose}
		>
			{#snippet extra()}
				<div class="space-y-1.5">
					<label for="attach-files" class="text-sm font-medium"
						>{t(locale, 'page.journal.day.attachFiles')}</label
					>
					<!-- No name: files go to the documents API after the event is saved. -->
					<input
						id="attach-files"
						data-testid="attach-files"
						type="file"
						multiple
						accept={DOCUMENT_ACCEPT}
						onchange={(e) => (files = Array.from(e.currentTarget.files ?? []))}
						class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
					/>
					<p class="text-xs text-muted-foreground">
						{t(locale, 'page.documents.dropHint', { max: uploadMaxMb })}
					</p>
				</div>
				{#if documents.length > 0}
					<fieldset class="space-y-1.5">
						<legend class="text-sm font-medium"
							>{t(locale, 'page.journal.day.attachExisting')}</legend
						>
						<div
							class="max-h-40 space-y-1 overflow-y-auto rounded-md border border-input px-3 py-2"
						>
							{#each documents as doc (doc.id)}
								<label class="flex items-center gap-2 text-sm">
									<input type="checkbox" value={doc.id} bind:group={picked} />
									<span class="truncate">{doc.title} · {doc.date}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				{/if}
			{/snippet}
		</HealthEventForm>
	{/if}
</Modal>
