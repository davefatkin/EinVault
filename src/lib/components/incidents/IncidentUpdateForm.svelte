<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
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

	// Add or edit one timeline update. With `updateId` it edits that update and
	// posts the id; with `onfiles` it shows a picker whose files the caller
	// uploads after save.
	let {
		action,
		submit,
		idPrefix,
		updateId,
		values,
		allowTime,
		submitting,
		onfiles,
		mediaHint,
		oncancel
	}: {
		action: string;
		submit: SubmitFunction;
		/** Keeps element ids unique when several forms are on the page. */
		idPrefix: string;
		updateId?: string;
		values?: { body: string; severity: Severity | null; occurredAt: Date };
		/** Owners set the time; caretakers log "now". */
		allowTime: boolean;
		submitting: boolean;
		onfiles?: (files: File[]) => void;
		mediaHint?: string;
		oncancel: () => void;
	} = $props();
	const locale = getLocale();
	const SEVERITIES = severityOptions(locale);
	const initial = untrack(() => values);
	const timeValue = localDatetimeValue(initial?.occurredAt ?? new Date());
</script>

<form method="POST" {action} use:localDatetimes use:enhance={submit} class="space-y-4">
	{#if updateId}<input type="hidden" name="updateId" value={updateId} />{/if}
	<div class="space-y-1.5">
		<Label for="{idPrefix}-body">{t(locale, 'page.incident.labelUpdate')}</Label>
		<MarkdownTextarea
			id="{idPrefix}-body"
			name="body"
			value={initial?.body ?? ''}
			placeholder={t(locale, 'page.incident.placeholderUpdate')}
			rows={4}
		/>
	</div>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		{#if allowTime}
			<div class="space-y-1.5">
				<Label for="{idPrefix}-when">{t(locale, 'page.incident.labelWhen')}</Label>
				<Input
					id="{idPrefix}-when"
					name="occurredAt"
					type="datetime-local"
					autocomplete="off"
					value={timeValue}
				/>
			</div>
		{/if}
		<div class="space-y-1.5">
			<Label for="{idPrefix}-severity">{t(locale, 'page.incident.labelSeverity')}</Label>
			<Select id="{idPrefix}-severity" name="severity">
				<option value="" selected={!initial?.severity}
					>{t(locale, 'page.incident.severityNone')}</option
				>
				{#each SEVERITIES as s (s.value)}
					<option value={s.value} selected={initial?.severity === s.value}>{s.label}</option>
				{/each}
			</Select>
		</div>
	</div>
	{#if onfiles}
		<div class="space-y-1.5">
			<label for="{idPrefix}-files" class="text-sm font-medium"
				>{t(locale, 'page.incident.labelFiles')}</label
			>
			<input
				id="{idPrefix}-files"
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
		<Button type="submit" size="sm" disabled={submitting}>
			{submitting ? t(locale, 'common.saving') : t(locale, 'page.incident.saveUpdate')}
		</Button>
		<Button type="button" size="sm" variant="outline" disabled={submitting} onclick={oncancel}
			>{t(locale, 'common.cancel')}</Button
		>
	</div>
</form>
