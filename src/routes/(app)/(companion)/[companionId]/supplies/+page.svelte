<script lang="ts">
	import { Package, Plus } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import SupplySummaryRow from '#lib/components/supplies/SupplySummaryRow.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data } = $props();
	const locale = getLocale();

	const canEdit = $derived(data.companion.isActive !== false);
	const newHref = $derived(`/${data.companion.id}/supplies/new`);
</script>

<svelte:head>
	<title>{t(locale, 'page.supplies.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	{#if !canEdit}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.supplies.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<PageHeader title={t(locale, 'page.supplies.title')} tint="teal">
		{#snippet icon()}<Package class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			{#if canEdit}
				<Button size="sm" href={newHref}>
					<Plus class="h-4 w-4 mr-1.5" />
					{t(locale, 'page.supplies.add')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.supplies.length === 0}
		<EmptyState
			tint="teal"
			title={t(locale, 'page.supplies.empty')}
			body={t(locale, 'page.supplies.emptyBody')}
		>
			{#snippet icon()}<Package class="h-5 w-5" />{/snippet}
			{#snippet action()}
				{#if canEdit}
					<Button href={newHref}>{t(locale, 'page.supplies.add')}</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<ul class="divide-y divide-border rounded-2xl border bg-card">
			{#each data.supplies as supply (supply.id)}
				<li><SupplySummaryRow {supply} companionId={data.companion.id} /></li>
			{/each}
		</ul>
	{/if}
</div>
