<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import Modal from '#lib/components/Modal.svelte';
	import HealthEventForm from '#lib/components/health/HealthEventForm.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { DOCUMENT_ACCEPT, attachDocument, uploadDocument } from '#lib/documentsApi.js';
	import type { AttachableDocument } from '#lib/dayItems.js';
	import { t, getLocale } from '#lib/i18n/index.js';

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
	// Read once: a background refresh must not reset a date typed by hand.
	const initialAt = untrack(() => defaultAt);

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

	// Set when the modal unmounts, e.g. Back changed the day mid-save. A save
	// that finishes after that keeps its records but leaves the new day alone.
	let gone = false;
	$effect(() => () => {
		gone = true;
	});

	let failedPanel = $state<HTMLDivElement | undefined>(undefined);
	$effect(() => {
		if (phase === 'failed') failedPanel?.focus();
	});

	const submit: SubmitFunction = async ({ cancel }) => {
		if (phase !== 'form') {
			cancel();
			return;
		}
		phase = 'saving';
		error = null;
		try {
			await flush();
		} catch {
			phase = 'form';
			error = t(locale, 'media.actionFailed');
			cancel();
			return;
		}
		return async ({ result }) => {
			if (result.type !== 'success' || !result.data) {
				phase = 'form';
				error =
					result.type === 'failure'
						? String(result.data?.healthError ?? t(locale, 'media.actionFailed'))
						: t(locale, 'media.actionFailed');
				return;
			}
			// The event exists from here on: never return to the form.
			const saved = result.data as {
				healthEventId: string;
				day: string;
				reminderUrl: string | null;
			};
			let failed: { name: string; message: string }[] = [];
			try {
				failed = await attachAll(saved.healthEventId, saved.day);
				await refreshAll();
				if (!gone && failed.length === 0 && saved.reminderUrl) await goto(saved.reminderUrl);
			} catch {
				// Fall through: the finally block leaves the saving phase.
			} finally {
				// Once unmounted (Back mid-save, or the reminder page opened)
				// there is nothing left to show or close.
				if (!gone) {
					if (failed.length > 0) {
						failures = failed;
						reminderUrl = saved.reminderUrl;
						phase = 'failed';
					} else {
						// Saved, or a canceled navigation: close rather than stay locked.
						onclose();
					}
				}
			}
		};
	};
</script>

<Modal title={t(locale, 'page.health.newHealthEventTitle')} {onclose} locked={phase === 'saving'}>
	{#if phase === 'failed'}
		<div class="space-y-3 text-sm outline-none" tabindex="-1" bind:this={failedPanel}>
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
			defaultAt={initialAt}
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
