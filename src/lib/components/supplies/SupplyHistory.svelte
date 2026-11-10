<script lang="ts">
	import { enhance } from '$app/forms';
	import { Paperclip, Trash2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import { formatMoney } from '#lib/money.js';
	import { t, getLocale, type MessageKey } from '#lib/i18n/index.js';
	import { formatAmount, type SupplyEventView, type SupplyKind } from '#lib/supplies.js';

	// A supply's history, newest first. Purchases and corrections can be
	// deleted (deleteAction reverses them); uses can't: remove the dose instead.
	let {
		events,
		kind,
		unit,
		canEdit,
		deleteAction,
		moreHref = null
	}: {
		events: SupplyEventView[];
		kind: SupplyKind;
		unit: string | null;
		canEdit: boolean;
		deleteAction: string;
		moreHref?: string | null;
	} = $props();
	const locale = getLocale();

	const TYPE_LABEL: Record<SupplyEventView['type'], MessageKey> = {
		purchase: 'page.supplies.eventPurchase',
		use: 'page.supplies.eventUse',
		correction: 'page.supplies.eventCorrection'
	};

	function delta(event: SupplyEventView): string | null {
		if (event.quantityDelta === null || kind !== 'counted') return null;
		// "Used 1 tablet" reads better unsigned; purchases and corrections show the sign.
		const shown =
			event.type === 'use'
				? formatAmount(locale, Math.abs(event.quantityDelta))
				: formatAmount(locale, event.quantityDelta, true);
		return unit ? `${shown} ${unit}` : shown;
	}

	// The entry the Delete dialog asks about; one dialog and form serve every row.
	let pending = $state<SupplyEventView | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	const confirmMessage = $derived(
		pending?.type === 'correction'
			? t(locale, 'page.supplies.deleteCorrectionConfirm')
			: kind === 'duration'
				? t(locale, 'page.supplies.deletePurchaseConfirmDuration')
				: t(locale, 'page.supplies.deletePurchaseConfirm')
	);
</script>

<section aria-labelledby="supply-history">
	<h2
		id="supply-history"
		class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
	>
		{t(locale, 'page.supplies.history')}
	</h2>
	{#if events.length === 0}
		<p class="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
			{t(locale, 'page.supplies.noHistory')}
		</p>
	{:else}
		<ul class="divide-y divide-border rounded-2xl border bg-card">
			{#each events as event (event.id)}
				{@const amount = delta(event)}
				<li class="flex items-start gap-3 px-5 py-3 text-sm">
					<div class="min-w-0 flex-1 space-y-0.5">
						<p class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
							<span class="font-medium text-foreground">{t(locale, TYPE_LABEL[event.type])}</span>
							{#if amount}<span class="tabular-nums text-foreground">{amount}</span>{/if}
							{#if event.companionName}
								<span class="text-muted-foreground"
									>{t(locale, 'page.supplies.eventForPet', { name: event.companionName })}</span
								>
							{/if}
							{#if event.costMinor !== null && event.currency}
								<span class="tabular-nums text-foreground"
									>{formatMoney(event.costMinor, event.currency, locale)}</span
								>
							{/if}
							{#if event.receipt}
								<a
									href={event.receipt.url}
									target="_blank"
									rel="noopener"
									title={event.receipt.title}
									class="inline-flex items-center gap-1 text-primary hover:underline"
									><Paperclip class="h-3.5 w-3.5" aria-hidden="true" />{t(
										locale,
										'page.supplies.receipt'
									)}</a
								>
							{/if}
						</p>
						<p class="text-xs text-muted-foreground">
							<LocalTime date={event.at} format={event.type === 'purchase' ? 'date' : 'datetime'} />
							{#if event.createdBy}
								{t(locale, 'page.supplies.eventBy', { name: event.createdBy })}
							{/if}
						</p>
						{#if event.note}
							<p class="whitespace-pre-line text-xs text-muted-foreground">{event.note}</p>
						{/if}
					</div>
					{#if canEdit && event.type !== 'use'}
						<Button
							variant="ghost"
							size="icon-sm"
							class="shrink-0 text-muted-foreground"
							aria-label={t(locale, 'page.supplies.deleteEvent')}
							title={t(locale, 'page.supplies.deleteEvent')}
							onclick={() => (pending = event)}
						>
							<Trash2 class="h-4 w-4" />
						</Button>
					{/if}
				</li>
			{/each}
		</ul>
		{#if moreHref}
			<div class="mt-3 flex justify-center">
				<Button variant="soft" size="sm" href={moreHref} data-sveltekit-noscroll>
					{t(locale, 'page.supplies.showMore')}
				</Button>
			</div>
		{/if}
	{/if}
</section>

{#if canEdit}
	<form bind:this={deleteForm} method="POST" action={deleteAction} use:enhance class="hidden">
		<input type="hidden" name="eventId" value={pending?.id ?? ''} />
	</form>
	<ConfirmDialog
		open={pending !== null}
		message={confirmMessage}
		onconfirm={() => {
			deleteForm?.requestSubmit();
			pending = null;
		}}
		oncancel={() => (pending = null)}
	/>
{/if}
