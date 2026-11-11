<script lang="ts">
	import { getContext } from 'svelte';
	import { Package } from '@lucide/svelte';
	import SupplyBadges from './SupplyBadges.svelte';
	import { formatDateOnly } from '#lib/date.js';
	import { todayInZone } from '#lib/medications.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { pageIconClass } from '#lib/pageIdentity.js';
	import { supplyStockLine, type SupplySummary } from '#lib/supplies.js';

	// One supply in a list: the supplies page and the dashboard card.
	// companionId is the pet whose page this is; the others are "shared with".
	let { supply, companionId }: { supply: SupplySummary; companionId: string } = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');

	const stockLine = $derived(supplyStockLine(locale, supply));
	const expiryLine = $derived.by(() => {
		if (!supply.expiresOn) return null;
		const date = formatDateOnly(supply.expiresOn, locale) ?? supply.expiresOn;
		const expired = supply.expiresOn < todayInZone(timeZone);
		return t(locale, expired ? 'page.supplies.expiredOn' : 'page.supplies.expiresOn', { date });
	});
	const others = $derived(supply.companions.filter((c) => c.id !== companionId));
	const sharedWith = $derived(
		others.length > 0
			? t(locale, 'page.supplies.sharedWith', {
					names: new Intl.ListFormat(locale, { type: 'conjunction' }).format(
						others.map((c) => c.name)
					)
				})
			: null
	);
</script>

<div class="flex items-start gap-3 px-5 py-4">
	<span
		class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {pageIconClass(
			'teal'
		)}"
		aria-hidden="true"
	>
		<Package class="h-4 w-4" />
	</span>
	<div class="min-w-0 flex-1 space-y-1">
		<div class="flex flex-wrap items-center gap-2">
			<a
				href="/{companionId}/supplies/{supply.id}"
				class="font-medium text-foreground break-words hover:underline">{supply.name}</a
			>
			<SupplyBadges {supply} />
		</div>
		<p class="text-sm text-foreground">{stockLine}</p>
		{#if expiryLine || sharedWith}
			<p class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
				{#if expiryLine}<span>{expiryLine}</span>{/if}
				{#if sharedWith}<span>{sharedWith}</span>{/if}
			</p>
		{/if}
	</div>
</div>
