<script lang="ts">
	import { ChevronLeft, Package } from '@lucide/svelte';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import SupplyForm from '#lib/components/supplies/SupplyForm.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { SupplyFormValues } from '#lib/supplies.js';

	let { data, form } = $props();
	const locale = getLocale();
	// What a failed save sent back, so the form keeps what was typed.
	const failedValues = $derived(
		form && 'values' in form ? (form.values as SupplyFormValues) : null
	);
	const detailHref = $derived(`/${data.companion.id}/supplies/${data.supply.id}`);
</script>

<svelte:head>
	<title>{t(locale, 'page.supplies.editTitle')} | {data.supply.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={detailHref}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{data.supply.name}
	</a>

	<PageHeader title={t(locale, 'page.supplies.editTitle')} tint="teal">
		{#snippet icon()}<Package class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if form?.error}
		<Alert variant="coral"><AlertDescription>{form.error}</AlertDescription></Alert>
	{/if}

	<Card>
		<CardContent class="pt-6">
			<!-- The form seeds its fields once; another supply needs a fresh one. -->
			{#key data.supply.id}
				<SupplyForm
					action="?/update"
					values={failedValues ?? data.values}
					editing
					companions={data.companions}
					companionId={data.companion.id}
					today={data.today}
					cancelHref={detailHref}
				/>
			{/key}
		</CardContent>
	</Card>
</div>
