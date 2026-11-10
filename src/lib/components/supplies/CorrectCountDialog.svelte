<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Modal from '#lib/components/Modal.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Correct count: what is really there. The page's correct action records
	// the difference; the same count changes nothing.
	let {
		action,
		quantity,
		unit,
		onclose
	}: { action: string; quantity: number; unit: string | null; onclose: () => void } = $props();
	const locale = getLocale();

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
				error = String(result.data?.error ?? t(locale, 'error.invalidQuantity'));
			} else {
				await update();
			}
		};
	};
</script>

<Modal title={t(locale, 'page.supplies.correctCount')} {onclose} locked={saving}>
	<form method="POST" {action} use:enhance={submit} class="space-y-4">
		{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
		<p class="text-sm text-muted-foreground">{t(locale, 'page.supplies.correctHint')}</p>
		<div class="space-y-1.5 sm:max-w-xs">
			<Label for="correct-actual">
				{t(locale, 'page.supplies.labelActual')}{unit ? ` (${unit})` : ''}
			</Label>
			<Input
				id="correct-actual"
				name="actual"
				type="text"
				inputmode="decimal"
				autocomplete="off"
				required
				value={String(quantity)}
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="correct-note">{t(locale, 'page.supplies.labelNote')}</Label>
			<Textarea id="correct-note" name="note" rows={2} />
		</div>
		<div class="flex flex-wrap gap-3">
			<Button type="submit" disabled={saving}>
				{saving ? t(locale, 'common.saving') : t(locale, 'page.supplies.saveCount')}
			</Button>
			<Button type="button" variant="outline" disabled={saving} onclick={onclose}
				>{t(locale, 'common.cancel')}</Button
			>
		</div>
	</form>
</Modal>
