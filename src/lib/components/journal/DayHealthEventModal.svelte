<script lang="ts">
	import { untrack } from 'svelte';
	import Modal from '#lib/components/Modal.svelte';
	import HealthEventForm from '#lib/components/health/HealthEventForm.svelte';
	import PaperlessPicker from '#lib/components/PaperlessPicker.svelte';
	import HealthEventAttachments from '#lib/components/health/HealthEventAttachments.svelte';
	import AttachmentFailures from '#lib/components/health/AttachmentFailures.svelte';
	import { addPaperlessPick } from '#lib/healthAttachments.js';
	import { createHealthEventSave } from '#lib/healthEventSave.svelte.js';
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

	const save = createHealthEventSave({
		companionId: () => companionId,
		titles: () => Object.fromEntries(documents.map((d) => [d.id, d.title])),
		locale: () => locale,
		onclose: () => onclose(),
		// Saves typed journal text before the form posts.
		before: () => flush()
	});

	let pickerOpen = $state(false);
	// Escape reaches the picker first and then the Modal's window listener in
	// the same dispatch. Closing the picker a task later keeps the Modal locked
	// for that listener, so Escape closes only the picker.
	function closePicker() {
		setTimeout(() => (pickerOpen = false));
	}
</script>

<Modal
	title={t(locale, 'page.health.newHealthEventTitle')}
	{onclose}
	locked={save.phase === 'saving' || pickerOpen}
>
	{#if save.phase === 'failed'}
		<AttachmentFailures failures={save.failures} reminderUrl={save.reminderUrl} {onclose} />
	{:else}
		<p class="mb-3 text-xs text-muted-foreground" data-testid="day-health-link-hint">
			{t(locale, 'page.journal.day.linkHealthHint')}
		</p>
		<HealthEventForm
			action="?/addHealth"
			defaultAt={initialAt}
			submit={save.submit}
			submitting={save.phase === 'saving'}
			error={save.error}
			oncancel={onclose}
			medicationsHref="/{companionId}/medications"
		>
			{#snippet extra()}
				<HealthEventAttachments
					idPrefix="day"
					{documents}
					{uploadMaxMb}
					{paperlessEnabled}
					bind:pending={save.pending}
					onbrowse={() => (pickerOpen = true)}
					disabled={save.phase === 'saving'}
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
			save.pending = addPaperlessPick(save.pending, { paperlessId, title });
			closePicker();
		}}
		onclose={closePicker}
	/>
{/if}
