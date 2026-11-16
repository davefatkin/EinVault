<script lang="ts">
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '#lib/components/MarkdownTextarea.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import HealthEventAttachments from '#lib/components/health/HealthEventAttachments.svelte';
	import AttachmentFailures from '#lib/components/health/AttachmentFailures.svelte';
	import { localDatetimes } from '#lib/actions/localDatetimes.js';
	import { localDatetimeValue } from '#lib/date.js';
	import type { AttachableDocument } from '#lib/dayItems.js';
	import { addPaperlessPick, type PaperlessPick } from '#lib/healthAttachments.js';
	import { createHealthEventSave } from '#lib/healthEventSave.svelte.js';
	import type { HealthEventType } from '#lib/health.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { healthTypeOptions } from '#lib/i18n/labels.js';

	// The Health page's inline edit form. It owns its save, so mount it once per
	// opening of Edit: closing it drops any queued document changes.
	let {
		event,
		companionId,
		attached,
		documents,
		uploadMaxMb,
		paperlessEnabled,
		canAttach,
		onbrowse,
		ondone,
		onsaving
	}: {
		event: {
			id: string;
			type: HealthEventType;
			title: string;
			occurredAt: Date | string;
			vetName: string | null;
			vetClinic: string | null;
			notes: string | null;
		};
		companionId: string;
		/** Documents on this event, offered for removal. */
		attached: { id: string; title: string }[];
		/** Documents on no event, offered for linking. */
		documents: AttachableDocument[];
		uploadMaxMb: number;
		paperlessEnabled: boolean;
		canAttach: boolean;
		/** Opens the page's Paperless picker; it hands each pick to `addPick`. */
		onbrowse: (addPick: (pick: PaperlessPick) => void) => void;
		/** The edit is over: saved, closed after failures, or canceled. */
		ondone: () => void;
		/**
		 * Reports whether a save is in flight, and false on unmount. The page
		 * must not unmount this form while saving, or its failures are lost.
		 */
		onsaving?: (saving: boolean) => void;
	} = $props();
	const locale = getLocale();

	const save = createHealthEventSave({
		companionId: () => companionId,
		titles: () => Object.fromEntries([...attached, ...documents].map((d) => [d.id, d.title])),
		locale: () => locale,
		onclose: () => ondone(),
		readSaved: (data) => ({ healthEventId: event.id, day: String(data.day), reminderUrl: null })
	});
	const saving = $derived(save.phase === 'saving');
	$effect(() => {
		onsaving?.(saving);
	});
	$effect(() => () => onsaving?.(false));
</script>

<div class="border border-border rounded-lg px-4 py-4">
	{#if save.phase === 'failed'}
		<AttachmentFailures failures={save.failures} onclose={() => ondone()} />
	{:else}
		<form
			method="POST"
			action="?/updateHealth"
			use:localDatetimes
			use:enhance={save.submit}
			class="space-y-4"
		>
			{#if save.error}
				<p role="alert" class="text-sm text-destructive">{save.error}</p>
			{/if}
			<input type="hidden" name="id" value={event.id} />
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="space-y-1.5">
					<Label for="edit-title-{event.id}">{t(locale, 'page.health.labelTitle')}</Label>
					<Input
						id="edit-title-{event.id}"
						name="title"
						type="text"
						autocomplete="off"
						value={event.title}
						required
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="edit-type-{event.id}">{t(locale, 'page.health.labelType')}</Label>
					<Select id="edit-type-{event.id}" name="type" required>
						{#each healthTypeOptions( locale, { includeMedication: event.type === 'medication' } ) as ht (ht.value)}
							<option value={ht.value} selected={event.type === ht.value}>{ht.label}</option>
						{/each}
					</Select>
				</div>
			</div>
			<div class="space-y-1.5">
				<Label for="edit-occurredAt-{event.id}">{t(locale, 'page.health.labelDate')}</Label>
				<Input
					id="edit-occurredAt-{event.id}"
					name="occurredAt"
					type="datetime-local"
					autocomplete="off"
					value={localDatetimeValue(new Date(event.occurredAt))}
				/>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div class="space-y-1.5">
					<Label for="edit-vetName-{event.id}">{t(locale, 'page.health.labelVetName')}</Label>
					<Input
						id="edit-vetName-{event.id}"
						name="vetName"
						type="text"
						autocomplete="off"
						value={event.vetName ?? ''}
						placeholder={t(locale, 'page.health.placeholderVetName')}
					/>
				</div>
				<div class="space-y-1.5">
					<Label for="edit-vetClinic-{event.id}">{t(locale, 'page.health.labelClinic')}</Label>
					<Input
						id="edit-vetClinic-{event.id}"
						name="vetClinic"
						type="text"
						autocomplete="off"
						value={event.vetClinic ?? ''}
						placeholder={t(locale, 'page.health.placeholderClinic')}
					/>
				</div>
			</div>
			<div class="space-y-1.5">
				<Label for="edit-notes-{event.id}">{t(locale, 'page.health.labelNotes')}</Label>
				<MarkdownTextarea
					id="edit-notes-{event.id}"
					name="notes"
					value={event.notes ?? ''}
					placeholder={t(locale, 'page.health.placeholderNotes')}
					rows={4}
				/>
			</div>
			{#if canAttach}
				<HealthEventAttachments
					idPrefix="edit-{event.id}"
					{documents}
					{attached}
					{uploadMaxMb}
					{paperlessEnabled}
					bind:pending={save.pending}
					onbrowse={() => onbrowse((pick) => (save.pending = addPaperlessPick(save.pending, pick)))}
					disabled={saving}
				/>
			{/if}
			<div class="flex gap-3">
				<Button type="submit" size="sm" disabled={saving}>{t(locale, 'common.save')}</Button>
				<Button type="button" variant="outline" size="sm" disabled={saving} onclick={() => ondone()}
					>{t(locale, 'common.cancel')}</Button
				>
			</div>
		</form>
	{/if}
</div>
