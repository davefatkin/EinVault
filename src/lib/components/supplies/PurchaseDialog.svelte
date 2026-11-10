<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Modal from '#lib/components/Modal.svelte';
	import PaperlessPicker from '#lib/components/PaperlessPicker.svelte';
	import ReceiptField from '#lib/components/supplies/ReceiptField.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { SupplyKind } from '#lib/supplies.js';

	// Log purchase: date, quantity (counted), cost, new expiry, note and an
	// optional receipt, uploaded or picked from Paperless, filed under one of
	// the supply's pets. The page's purchase action saves it all at once.
	let {
		action,
		kind,
		unit,
		currency,
		today,
		companions,
		companionId,
		paperlessEnabled,
		onclose
	}: {
		action: string;
		kind: SupplyKind;
		unit: string | null;
		currency: string;
		/** Local YYYY-MM-DD from the server: the default and the latest date. */
		today: string;
		/** Active pets the supply is linked to; the receipt goes on one of them. */
		companions: { id: string; name: string }[];
		companionId: string;
		paperlessEnabled: boolean;
		onclose: () => void;
	} = $props();
	const locale = getLocale();

	let saving = $state(false);
	let error = $state<string | null>(null);
	let pickerOpen = $state(false);
	let paperlessId = $state<number | null>(null);

	function pickPaperless(id: number) {
		paperlessId = id;
		pickerOpen = false;
	}

	// Escape reaches the picker first and then the Modal's window listener in
	// the same dispatch. Closing the picker a task later keeps the Modal locked
	// for that listener, so Escape closes only the picker.
	function closePicker() {
		setTimeout(() => (pickerOpen = false));
	}

	const submit: SubmitFunction = () => {
		saving = true;
		error = null;
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'success') {
				await update();
				onclose();
			} else if (result.type === 'failure') {
				error = String(result.data?.error ?? t(locale, 'error.purchaseFailed'));
			} else {
				await update();
			}
		};
	};

	const field = 'space-y-1.5';
	const hint = 'text-xs text-muted-foreground';
</script>

<Modal title={t(locale, 'page.supplies.logPurchase')} {onclose} locked={saving || pickerOpen}>
	<form method="POST" {action} enctype="multipart/form-data" use:enhance={submit} class="space-y-4">
		{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div class={field}>
				<Label for="purchase-date">{t(locale, 'page.supplies.labelPurchaseDate')}</Label>
				<Input id="purchase-date" name="date" type="date" required max={today} value={today} />
			</div>
			{#if kind === 'counted'}
				<div class={field}>
					<Label for="purchase-quantity">
						{t(locale, 'page.supplies.labelQuantity')}{unit ? ` (${unit})` : ''}
					</Label>
					<Input
						id="purchase-quantity"
						name="quantity"
						type="text"
						inputmode="decimal"
						autocomplete="off"
						required
					/>
				</div>
			{/if}
			<div class={field}>
				<Label for="purchase-cost">{t(locale, 'page.supplies.labelCost', { currency })}</Label>
				<Input id="purchase-cost" name="cost" type="text" inputmode="decimal" autocomplete="off" />
			</div>
			<div class={field}>
				<Label for="purchase-expiresOn">{t(locale, 'page.supplies.labelNewExpiry')}</Label>
				<Input
					id="purchase-expiresOn"
					name="expiresOn"
					type="date"
					aria-describedby="purchase-expiresOn-hint"
				/>
				<p id="purchase-expiresOn-hint" class={hint}>
					{t(locale, 'page.supplies.newExpiryHint')}
				</p>
			</div>
		</div>

		<ReceiptField
			idPrefix="purchase"
			{paperlessEnabled}
			bind:paperlessId
			onbrowse={() => (pickerOpen = true)}
		/>

		{#if companions.length > 1}
			<div class={field}>
				<Label for="purchase-receiptCompanionId">{t(locale, 'page.supplies.receiptFor')}</Label>
				<Select id="purchase-receiptCompanionId" name="receiptCompanionId" value={companionId}>
					{#each companions as companion (companion.id)}
						<option value={companion.id}>{companion.name}</option>
					{/each}
				</Select>
			</div>
		{:else}
			<input type="hidden" name="receiptCompanionId" value={companionId} />
		{/if}

		<div class={field}>
			<Label for="purchase-note">{t(locale, 'page.supplies.labelNote')}</Label>
			<Textarea id="purchase-note" name="note" rows={2} />
		</div>

		<div class="flex flex-wrap gap-3">
			<Button type="submit" disabled={saving}>
				{saving ? t(locale, 'common.saving') : t(locale, 'page.supplies.savePurchase')}
			</Button>
			<Button type="button" variant="outline" disabled={saving} onclick={onclose}
				>{t(locale, 'common.cancel')}</Button
			>
		</div>
	</form>
</Modal>

{#if paperlessEnabled}
	<!-- Outside the Modal: its transformed dialog would trap the picker's fixed overlay. -->
	<PaperlessPicker open={pickerOpen} onpick={pickPaperless} onclose={closePicker} />
{/if}
