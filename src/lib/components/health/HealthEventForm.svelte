<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Plus } from '@lucide/svelte';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeOptions } from '$lib/i18n/labels';
	import type { HealthEventType } from '$lib/health';

	// The new-health-event form, shared by the Health Log and the journal day.
	// e2e targets its element ids, so render one per page.
	let {
		action,
		submit,
		defaultAt,
		submitting,
		prefill = { title: '', type: '', notes: '' },
		oncancel,
		extra
	}: {
		action: string;
		submit: SubmitFunction;
		/** datetime-local value for the date field. */
		defaultAt: string;
		submitting: boolean;
		prefill?: { title: string; type: HealthEventType | ''; notes: string };
		oncancel: () => void;
		/** Rendered above the buttons, e.g. the journal day's attach options. */
		extra?: Snippet;
	} = $props();
	const locale = getLocale();
	const HEALTH_TYPES = healthTypeOptions(locale);
</script>

<form method="POST" {action} use:localDatetimes use:enhance={submit} class="space-y-4">
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<div class="space-y-1.5">
			<Label for="title">{t(locale, 'page.health.labelTitle')}</Label>
			<Input
				id="title"
				name="title"
				type="text"
				autocomplete="off"
				placeholder={t(locale, 'page.health.placeholderTitle')}
				value={prefill.title}
				required
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="type">{t(locale, 'page.health.labelType')}</Label>
			<Select id="type" name="type" required>
				{#each HEALTH_TYPES as ht (ht.value)}
					<option value={ht.value} selected={ht.value === prefill.type}>{ht.label}</option>
				{/each}
			</Select>
		</div>
	</div>
	<div class="space-y-1.5">
		<Label for="occurredAt">{t(locale, 'page.health.labelDate')}</Label>
		<Input
			id="occurredAt"
			name="occurredAt"
			type="datetime-local"
			autocomplete="off"
			value={defaultAt}
		/>
	</div>
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<div class="space-y-1.5">
			<Label for="vetName">{t(locale, 'page.health.labelVetName')}</Label>
			<Input
				id="vetName"
				name="vetName"
				type="text"
				autocomplete="off"
				placeholder={t(locale, 'page.health.placeholderVetName')}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="vetClinic">{t(locale, 'page.health.labelClinic')}</Label>
			<Input
				id="vetClinic"
				name="vetClinic"
				type="text"
				autocomplete="off"
				placeholder={t(locale, 'page.health.placeholderClinic')}
			/>
		</div>
	</div>
	<div class="space-y-1.5">
		<Label for="notes">{t(locale, 'page.health.labelNotes')}</Label>
		<MarkdownTextarea
			id="notes"
			name="notes"
			value={prefill.notes}
			placeholder={t(locale, 'page.health.placeholderNotes')}
			rows={4}
		/>
	</div>
	{#if extra}{@render extra()}{/if}
	<div class="flex flex-wrap gap-3">
		<Button type="submit" disabled={submitting}>
			{submitting ? t(locale, 'page.health.savingEvent') : t(locale, 'page.health.saveEvent')}
		</Button>
		<Button type="submit" name="andReminder" value="1" variant="outline" disabled={submitting}>
			<Plus class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'page.health.saveAndAddReminder')}
		</Button>
		<Button type="button" variant="outline" disabled={submitting} onclick={oncancel}
			>{t(locale, 'common.cancel')}</Button
		>
	</div>
</form>
