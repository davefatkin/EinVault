<script lang="ts">
	import { getContext } from 'svelte';
	import {
		ChevronLeft,
		ClipboardCheck,
		Package,
		Pencil,
		ShoppingCart,
		Trash2
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import SupplyBadges from '#lib/components/supplies/SupplyBadges.svelte';
	import SupplyHistory from '#lib/components/supplies/SupplyHistory.svelte';
	import PurchaseDialog from '#lib/components/supplies/PurchaseDialog.svelte';
	import CorrectCountDialog from '#lib/components/supplies/CorrectCountDialog.svelte';
	import { formatDateOnly } from '#lib/date.js';
	import { todayInZone } from '#lib/medications.js';
	import { formatAmount, supplyStockLine } from '#lib/supplies.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');

	const supply = $derived(data.supply);
	const base = $derived(`/${data.companion.id}/supplies`);
	const canEdit = $derived(data.companion.isActive !== false);
	const counted = $derived(supply.kind === 'counted');
	const date = (ymd: string) => formatDateOnly(ymd, locale) ?? ymd;

	const facts = $derived(
		[
			supply.runOutOn && supply.daysLeft
				? t(locale, 'page.supplies.runsOutOn', { date: date(supply.runOutOn) })
				: null,
			supply.lastsDays !== null && !counted
				? t(locale, 'page.supplies.lastsDays', { count: supply.lastsDays })
				: null,
			supply.stockedOn && !counted
				? t(locale, 'page.supplies.lastBought', { date: date(supply.stockedOn) })
				: null,
			supply.expiresOn
				? t(
						locale,
						supply.expiresOn < todayInZone(timeZone)
							? 'page.supplies.expiredOn'
							: 'page.supplies.expiresOn',
						{ date: date(supply.expiresOn) }
					)
				: null,
			counted && supply.lowStockAt !== null
				? t(locale, 'page.supplies.lowStockAt', { count: formatAmount(locale, supply.lowStockAt) })
				: null
		].filter((f): f is string => f !== null)
	);
	const pets = $derived(
		new Intl.ListFormat(locale, { type: 'conjunction' }).format(
			supply.companions.map((c) => c.name)
		)
	);
	// The receipt goes on one of the supply's active pets, this one first.
	const receiptPets = $derived(
		supply.companions
			.filter((c) => c.isActive)
			.sort((a, b) => Number(b.id === data.companion.id) - Number(a.id === data.companion.id))
	);

	let purchaseOpen = $state(false);
	let correctOpen = $state(false);
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
</script>

<svelte:head>
	<title>{supply.name} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={base}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{t(locale, 'page.supplies.backToList')}
	</a>

	{#if !canEdit}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.supplies.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	{#if form && 'error' in form && form.error}
		<Alert variant="coral"><AlertDescription>{form.error}</AlertDescription></Alert>
	{/if}

	<PageHeader title={supply.name} tint={supply.runningLow || supply.expiring ? 'gold' : 'primary'}>
		{#snippet icon()}<Package class="h-5 w-5" />{/snippet}
	</PageHeader>
	<!-- Its own row, so the buttons wrap at phone width. -->
	{#if canEdit}
		<div class="flex flex-wrap gap-2">
			<Button variant="soft" size="sm" onclick={() => (purchaseOpen = true)}>
				<ShoppingCart class="h-4 w-4 mr-1.5" />{t(locale, 'page.supplies.logPurchase')}
			</Button>
			{#if counted}
				<Button variant="soft" size="sm" onclick={() => (correctOpen = true)}>
					<ClipboardCheck class="h-4 w-4 mr-1.5" />{t(locale, 'page.supplies.correctCount')}
				</Button>
			{/if}
			<Button variant="soft" size="sm" href="{base}/{supply.id}/edit">
				<Pencil class="h-4 w-4 mr-1.5" />{t(locale, 'common.edit')}
			</Button>
			<Button variant="softDestructive" size="sm" onclick={() => (confirmDelete = true)}>
				<Trash2 class="h-4 w-4 mr-1.5" />{t(locale, 'common.delete')}
			</Button>
		</div>
	{/if}

	<Card>
		<CardContent class="space-y-2 p-5">
			<div class="flex flex-wrap items-center gap-2">
				<p class="text-lg font-semibold text-foreground">{supplyStockLine(locale, supply)}</p>
				<SupplyBadges {supply} />
			</div>
			{#if facts.length > 0}
				<p class="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
					{#each facts as fact (fact)}<span>{fact}</span>{/each}
				</p>
			{/if}
			<p class="text-sm text-muted-foreground">
				{t(locale, 'page.supplies.labelPets')}: <span class="text-foreground">{pets}</span>
			</p>
			{#if data.notes}
				<p class="whitespace-pre-line text-sm text-foreground">{data.notes}</p>
			{/if}
		</CardContent>
	</Card>

	<SupplyHistory
		events={data.events}
		kind={supply.kind}
		unit={supply.unit}
		{canEdit}
		deleteAction="?/deleteEvent"
		moreHref={data.moreEvents ? `?history=${data.moreEvents}` : null}
	/>
</div>

{#if purchaseOpen}
	<PurchaseDialog
		action="?/purchase"
		kind={supply.kind}
		unit={supply.unit}
		currency={data.currency}
		today={data.today}
		companions={receiptPets}
		companionId={data.companion.id}
		paperlessEnabled={data.paperlessEnabled ?? false}
		onclose={() => (purchaseOpen = false)}
	/>
{/if}
{#if correctOpen}
	<CorrectCountDialog
		action="?/correct"
		quantity={supply.quantity ?? 0}
		unit={supply.unit}
		onclose={() => (correctOpen = false)}
	/>
{/if}
<form bind:this={deleteForm} method="POST" action="?/delete" class="hidden"></form>
<ConfirmDialog
	open={confirmDelete}
	message={t(locale, 'page.supplies.deleteConfirm', { name: supply.name })}
	onconfirm={() => {
		confirmDelete = false;
		deleteForm?.requestSubmit();
	}}
	oncancel={() => (confirmDelete = false)}
/>
