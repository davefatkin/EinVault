<script lang="ts">
	import { Pill, Plus } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import MedicationForm from '#lib/components/medications/MedicationForm.svelte';
	import MedicationSummaryRow from '#lib/components/medications/MedicationSummaryRow.svelte';
	import { ownerMedicationCaps } from '#lib/medications.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { stripUrlParams } from '#lib/stripUrlParams.js';

	let { data, form } = $props();
	const locale = getLocale();

	const base = $derived(`/${data.companion.id}/medications`);
	const companionActive = $derived(data.companion.isActive !== false);
	const caps = $derived(ownerMedicationCaps(companionActive));
	// Active through its last day (ended_on is inclusive).
	const active = $derived(data.medications.filter((m) => m.active));
	const ended = $derived(data.medications.filter((m) => !m.active));

	let showForm = $state(false);
	// The dashboard's "Add medication" lands here with ?new=1: open the form
	// once, then drop the param so a reload doesn't reopen it.
	$effect(() => {
		if (page.url.searchParams.get('new') !== '1') return;
		if (caps.canEdit) showForm = true;
		tick().then(() => stripUrlParams('new'));
	});
	// A failed save (also without JS) keeps the form open with what was typed,
	// until Cancel dismisses those values.
	const formValues = $derived(form && 'values' in form ? form.values : null);
	let dismissedValues = $state<unknown>(null);
	const formOpen = $derived(showForm || (formValues !== null && formValues !== dismissedValues));
	function closeForm() {
		showForm = false;
		dismissedValues = formValues;
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.medications.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	{#if !companionActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.medications.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<PageHeader title={t(locale, 'page.medications.title')} tint="teal">
		{#snippet icon()}<Pill class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			{#if caps.canEdit && !formOpen}
				<Button size="sm" onclick={() => (showForm = true)}>
					<Plus class="h-4 w-4 mr-1.5" />
					{t(locale, 'page.medications.add')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if form && 'error' in form && form.error}
		<Alert variant="coral"><AlertDescription>{form.error}</AlertDescription></Alert>
	{/if}

	{#if formOpen && caps.canEdit}
		<Card class="animate-slide-up">
			<CardContent class="pt-6">
				<h2 class="mb-4 font-semibold text-foreground">
					{t(locale, 'page.medications.newTitle')}
				</h2>
				<MedicationForm
					action="?/create"
					values={formValues}
					supplies={data.supplyOptions}
					companionId={data.companion.id}
					today={data.today}
					oncancel={closeForm}
					onsaved={closeForm}
				/>
			</CardContent>
		</Card>
	{/if}

	{#if data.medications.length === 0}
		{#if !formOpen}
			<EmptyState
				tint="teal"
				title={t(locale, 'page.medications.empty')}
				body={t(locale, 'page.medications.emptyBody')}
			>
				{#snippet icon()}<Pill class="h-5 w-5" />{/snippet}
				{#snippet action()}
					{#if caps.canEdit}
						<Button onclick={() => (showForm = true)}>{t(locale, 'page.medications.add')}</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<section aria-labelledby="medications-active">
			<h2
				id="medications-active"
				class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
			>
				{t(locale, 'page.medications.active')}
			</h2>
			{#if active.length === 0}
				<p class="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
					{t(locale, 'page.medications.noActive')}
				</p>
			{:else}
				<ul class="divide-y divide-border rounded-2xl border bg-card">
					{#each active as medication (medication.id)}
						<li>
							<MedicationSummaryRow
								{medication}
								{caps}
								givenAction="?/given"
								detailHref="{base}/{medication.id}"
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if ended.length > 0}
			<section aria-labelledby="medications-ended">
				<h2
					id="medications-ended"
					class="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					{t(locale, 'page.medications.ended')}
				</h2>
				<ul class="divide-y divide-border rounded-2xl border bg-card">
					{#each ended as medication (medication.id)}
						<li>
							<MedicationSummaryRow
								{medication}
								{caps}
								givenAction="?/given"
								detailHref="{base}/{medication.id}"
							/>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
