<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { Plus } from '@lucide/svelte';
	import MarkdownTextarea from '#lib/components/MarkdownTextarea.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { localDatetimes } from '#lib/actions/localDatetimes.js';
	import { localDatetimeValue } from '#lib/date.js';
	import { MEDIA_ACCEPT } from '#lib/media.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { severityOptions } from '#lib/i18n/labels.js';
	import type { Severity } from '#lib/incidents.js';

	// Create and edit form for an incident's overview: title, start, severity,
	// notes, and (create only) photos and videos that the page uploads once the
	// incident exists. e2e targets the element ids, so render one per page.
	let {
		action,
		submit,
		values,
		allowStart,
		submitting,
		submitLabel,
		onfiles,
		mediaHint,
		showReminder = false,
		oncancel
	}: {
		action: string;
		submit: SubmitFunction;
		values?: {
			title: string;
			notes: string | null;
			severity: Severity | null;
			occurredAt: Date;
		};
		/** Owners set the start; caretakers log "now". */
		allowStart: boolean;
		submitting: boolean;
		submitLabel: string;
		/** Shows the file picker; the page uploads the files after save. */
		onfiles?: (files: File[]) => void;
		mediaHint?: string;
		showReminder?: boolean;
		oncancel: () => void;
	} = $props();
	const locale = getLocale();
	const SEVERITIES = severityOptions(locale);
	// Read once: a background refresh must not reset a date typed by hand.
	const initial = untrack(() => values);
	const startValue = localDatetimeValue(initial?.occurredAt ?? new Date());
</script>

<form method="POST" {action} use:localDatetimes use:enhance={submit} class="space-y-4">
	<div class="space-y-1.5">
		<Label for="incident-title">{t(locale, 'page.health.labelTitle')}</Label>
		<Input
			id="incident-title"
			name="title"
			type="text"
			autocomplete="off"
			placeholder={t(locale, 'page.incident.placeholderTitle')}
			value={initial?.title ?? ''}
			required
		/>
	</div>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		{#if allowStart}
			<div class="space-y-1.5">
				<Label for="incident-start">{t(locale, 'page.incident.labelStart')}</Label>
				<Input
					id="incident-start"
					name="occurredAt"
					type="datetime-local"
					autocomplete="off"
					value={startValue}
				/>
			</div>
		{/if}
		<div class="space-y-1.5">
			<Label for="incident-severity">{t(locale, 'page.incident.labelSeverity')}</Label>
			<Select id="incident-severity" name="severity">
				<option value="" selected={!initial?.severity}
					>{t(locale, 'page.incident.severityNone')}</option
				>
				{#each SEVERITIES as s (s.value)}
					<option value={s.value} selected={initial?.severity === s.value}>{s.label}</option>
				{/each}
			</Select>
		</div>
	</div>
	<div class="space-y-1.5">
		<Label for="incident-notes">{t(locale, 'page.health.labelNotes')}</Label>
		<MarkdownTextarea
			id="incident-notes"
			name="notes"
			value={initial?.notes ?? ''}
			placeholder={t(locale, 'page.incident.placeholderNotes')}
			rows={5}
		/>
	</div>
	{#if onfiles}
		<div class="space-y-1.5">
			<label for="incident-files" class="text-sm font-medium"
				>{t(locale, 'page.incident.labelFiles')}</label
			>
			<!-- No name: files go to the media endpoint after the incident is saved. -->
			<input
				id="incident-files"
				type="file"
				multiple
				accept={MEDIA_ACCEPT}
				onchange={(e) => onfiles(Array.from(e.currentTarget.files ?? []))}
				class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
			/>
			{#if mediaHint}<p class="text-xs text-muted-foreground">{mediaHint}</p>{/if}
		</div>
	{/if}
	<div class="flex flex-wrap gap-3">
		<Button type="submit" disabled={submitting}>
			{submitting ? t(locale, 'common.saving') : submitLabel}
		</Button>
		{#if showReminder}
			<Button type="submit" name="andReminder" value="1" variant="outline" disabled={submitting}>
				<Plus class="h-3.5 w-3.5 mr-1.5" />
				{t(locale, 'page.health.saveAndAddReminder')}
			</Button>
		{/if}
		<Button type="button" variant="outline" disabled={submitting} onclick={oncancel}
			>{t(locale, 'common.cancel')}</Button
		>
	</div>
</form>
