<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { goto, refreshAll } from '$app/navigation';
	import Modal from '#lib/components/Modal.svelte';
	import HealthEventForm from '#lib/components/health/HealthEventForm.svelte';
	import PaperlessPicker from '#lib/components/PaperlessPicker.svelte';
	import HealthEventAttachments from '#lib/components/health/HealthEventAttachments.svelte';
	import AttachmentFailures from '#lib/components/health/AttachmentFailures.svelte';
	import {
		addPaperlessPick,
		applyAttachments,
		emptyPending,
		type AttachFailure,
		type PendingAttachments
	} from '#lib/healthAttachments.js';
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
		paperlessEnabled,
		flush,
		onclose
	}: {
		companionId: string;
		defaultAt: string;
		documents: AttachableDocument[];
		uploadMaxMb: number;
		paperlessEnabled: boolean;
		flush: () => Promise<void>;
		onclose: () => void;
	} = $props();
	const locale = getLocale();
	// Read once: a background refresh must not reset a date typed by hand.
	const initialAt = untrack(() => defaultAt);

	let phase = $state<'form' | 'saving' | 'failed'>('form');
	let error = $state<string | null>(null);
	let pending = $state<PendingAttachments>(emptyPending());
	let failures = $state<AttachFailure[]>([]);
	let reminderUrl = $state<string | null>(null);

	// Set when the modal unmounts, e.g. Back changed the day mid-save. A save
	// that finishes after that keeps its records but leaves the new day alone.
	let gone = false;
	$effect(() => () => {
		gone = true;
	});

	let pickerOpen = $state(false);
	// Escape reaches the picker first and then the Modal's window listener in
	// the same dispatch. Closing the picker a task later keeps the Modal locked
	// for that listener, so Escape closes only the picker.
	function closePicker() {
		setTimeout(() => (pickerOpen = false));
	}

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
			let failed: AttachFailure[] = [];
			try {
				failed = await applyAttachments({
					companionId,
					healthEventId: saved.healthEventId,
					day: saved.day,
					pending,
					titles: Object.fromEntries(documents.map((d) => [d.id, d.title])),
					locale
				});
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

<Modal
	title={t(locale, 'page.health.newHealthEventTitle')}
	{onclose}
	locked={phase === 'saving' || pickerOpen}
>
	{#if phase === 'failed'}
		<AttachmentFailures {failures} {reminderUrl} {onclose} />
	{:else}
		{#if error}
			<p role="alert" class="mb-3 text-sm text-destructive">{error}</p>
		{/if}
		<p class="mb-3 text-xs text-muted-foreground" data-testid="day-health-link-hint">
			{t(locale, 'page.journal.day.linkHealthHint')}
		</p>
		<HealthEventForm
			action="?/addHealth"
			defaultAt={initialAt}
			{submit}
			submitting={phase === 'saving'}
			oncancel={onclose}
			medicationsHref="/{companionId}/medications"
		>
			{#snippet extra()}
				<HealthEventAttachments
					idPrefix="day"
					{documents}
					{uploadMaxMb}
					{paperlessEnabled}
					bind:pending
					onbrowse={() => (pickerOpen = true)}
					disabled={phase === 'saving'}
				/>
			{/snippet}
		</HealthEventForm>
	{/if}
</Modal>

<!-- Outside the Modal: its transformed dialog would trap the picker's fixed overlay. -->
{#if paperlessEnabled}
	<PaperlessPicker
		open={pickerOpen}
		onpick={(paperlessId, title) => {
			pending = addPaperlessPick(pending, { paperlessId, title });
			closePicker();
		}}
		onclose={closePicker}
	/>
{/if}
