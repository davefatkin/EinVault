<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Modal from '#lib/components/Modal.svelte';
	import MarkdownTextarea from '#lib/components/MarkdownTextarea.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { localDatetimes } from '#lib/actions/localDatetimes.js';
	import { localDatetimeValue } from '#lib/date.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { severityOptions } from '#lib/i18n/labels.js';

	// Mark resolved: when (default now) and an optional closing update, saved
	// together by the page's resolve action.
	let { action, onclose }: { action: string; onclose: () => void } = $props();
	const locale = getLocale();
	const SEVERITIES = severityOptions(locale);
	const now = localDatetimeValue();

	let saving = $state(false);
	let error = $state<string | null>(null);

	const submit: SubmitFunction = () => {
		saving = true;
		error = null;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				await update();
				onclose();
			} else if (result.type === 'failure') {
				error = String(result.data?.error ?? t(locale, 'media.actionFailed'));
			} else {
				await update();
			}
		};
	};
</script>

<Modal title={t(locale, 'page.incident.markResolved')} {onclose} locked={saving}>
	<form method="POST" {action} use:localDatetimes use:enhance={submit} class="space-y-4">
		{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
		<div class="space-y-1.5">
			<Label for="resolve-at">{t(locale, 'page.incident.labelResolvedAt')}</Label>
			<Input id="resolve-at" name="resolvedAt" type="datetime-local" value={now} />
		</div>
		<div class="space-y-1.5">
			<Label for="resolve-body">{t(locale, 'page.incident.labelClosing')}</Label>
			<MarkdownTextarea
				id="resolve-body"
				name="body"
				placeholder={t(locale, 'page.incident.closingHint')}
				rows={3}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="resolve-severity">{t(locale, 'page.incident.labelSeverity')}</Label>
			<Select id="resolve-severity" name="severity">
				<option value="">{t(locale, 'page.incident.severityNone')}</option>
				{#each SEVERITIES as s (s.value)}
					<option value={s.value}>{s.label}</option>
				{/each}
			</Select>
		</div>
		<div class="flex flex-wrap gap-3">
			<Button type="submit" disabled={saving}>
				{saving ? t(locale, 'common.saving') : t(locale, 'page.incident.markResolved')}
			</Button>
			<Button type="button" variant="outline" disabled={saving} onclick={onclose}
				>{t(locale, 'common.cancel')}</Button
			>
		</div>
	</form>
</Modal>
