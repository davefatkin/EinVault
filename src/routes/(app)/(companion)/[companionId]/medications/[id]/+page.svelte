<script lang="ts">
	import { enhance } from '$app/forms';
	import {
		BellPlus,
		CalendarX2,
		ChevronLeft,
		CircleStop,
		Pencil,
		Pill,
		RotateCcw,
		Trash2
	} from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import MedicationStatusBadge from '#lib/components/medications/MedicationStatusBadge.svelte';
	import { Card, CardContent } from '#lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import MedicationFacts from '#lib/components/medications/MedicationFacts.svelte';
	import MedicationForm from '#lib/components/medications/MedicationForm.svelte';
	import MedicationGivenButton from '#lib/components/medications/MedicationGivenButton.svelte';
	import { medicationFormValuesOf, ownerMedicationCaps } from '#lib/medications.js';
	import { medicationReminderPrefillUrl } from '#lib/health.js';
	import { formatRecurrence } from '#lib/reminderRecurrence.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();

	const med = $derived(data.medication);
	const base = $derived(`/${data.companion.id}/medications`);
	const caps = $derived(ownerMedicationCaps(data.companion.isActive !== false));
	// A failed save without JS lands here without edit=1; its values keep the form open.
	const formValues = $derived(form && 'values' in form ? form.values : null);
	const editing = $derived(caps.canEdit && (data.editing || formValues !== null));

	let confirmEnd = $state(false);
	let confirmDelete = $state(false);
	let endForm = $state<HTMLFormElement | null>(null);
	let deleteForm = $state<HTMLFormElement | null>(null);
	// The dose the Remove dialog asks about; one dialog and form serve every row.
	let removeDoseId = $state<string | null>(null);
	let removeDoseForm = $state<HTMLFormElement | null>(null);

	const sectionHeading =
		'mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground';
</script>

<svelte:head>
	<title>{med.name} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={base}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{t(locale, 'page.medications.backToList')}
	</a>

	{#if data.companion.isActive === false}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.medications.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	{#if form && 'error' in form && form.error}
		<Alert variant="coral"><AlertDescription>{form.error}</AlertDescription></Alert>
	{/if}

	{#if editing}
		<PageHeader title={med.name} tint="primary">
			{#snippet icon()}<Pill class="h-5 w-5" />{/snippet}
		</PageHeader>
		<Card>
			<CardContent class="pt-6">
				<!-- The form seeds its fields once; another medication needs a fresh one. -->
				{#key med.id}
					<MedicationForm
						action="?/update"
						values={formValues ?? medicationFormValuesOf(med)}
						supplies={data.supplyOptions}
						companionId={data.companion.id}
						today={data.today}
						cancelHref="{base}/{med.id}"
					/>
				{/key}
			</CardContent>
		</Card>
	{:else}
		<PageHeader title={med.name} tint={med.active ? 'primary' : 'muted'}>
			{#snippet icon()}<Pill class="h-5 w-5" />{/snippet}
			{#snippet actions()}
				<MedicationStatusBadge medication={med} />
				{#if caps.canEdit}
					<Button variant="soft" size="sm" href="?edit=1">
						<Pencil class="h-4 w-4 mr-1.5" />{t(locale, 'common.edit')}
					</Button>
					{#if med.active}
						<!-- With an end date set, End means "end it today" instead. -->
						<Button variant="soft" size="sm" onclick={() => (confirmEnd = true)}>
							<CircleStop class="h-4 w-4 mr-1.5" />{med.endedOn
								? t(locale, 'page.medications.endNow')
								: t(locale, 'page.medications.end')}
						</Button>
						{#if med.endedOn}
							<form method="POST" action="?/restart" use:enhance>
								<Button type="submit" variant="soft" size="sm">
									<CalendarX2 class="h-4 w-4 mr-1.5" />{t(locale, 'page.medications.removeEndDate')}
								</Button>
							</form>
						{/if}
					{:else}
						<form method="POST" action="?/restart" use:enhance>
							<Button type="submit" variant="soft" size="sm">
								<RotateCcw class="h-4 w-4 mr-1.5" />{t(locale, 'page.medications.restart')}
							</Button>
						</form>
					{/if}
					<Button variant="softDestructive" size="sm" onclick={() => (confirmDelete = true)}>
						<Trash2 class="h-4 w-4 mr-1.5" />{t(locale, 'common.delete')}
					</Button>
				{/if}
			{/snippet}
		</PageHeader>

		<Card>
			<CardContent class="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
				<div class="min-w-0 flex-1">
					<MedicationFacts medication={med} showStarted />
				</div>
				{#if caps.canLogDose && med.active}
					<div class="self-end sm:self-auto">
						<MedicationGivenButton medication={med} action="?/given" />
					</div>
				{/if}
			</CardContent>
		</Card>

		<section aria-labelledby="dose-reminders">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<h2 id="dose-reminders" class={sectionHeading}>
					{t(locale, 'page.medications.doseReminders')}
				</h2>
				{#if caps.canEdit && med.active}
					<Button
						variant="soft"
						size="sm"
						class="mb-2"
						href={medicationReminderPrefillUrl(data.companion.id, med)}
					>
						<BellPlus class="h-4 w-4 mr-1.5" />{t(locale, 'page.medications.addDoseReminder')}
					</Button>
				{/if}
			</div>
			{#if data.reminders.length === 0}
				<p class="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
					{med.active
						? t(locale, 'page.medications.noDoseReminders')
						: t(locale, 'page.medications.endedNoReminders')}
				</p>
			{:else}
				<ul class="divide-y divide-border rounded-2xl border bg-card">
					{#each data.reminders as reminder (reminder.id)}
						<li>
							<a
								href="/{data.companion.id}/reminders?detail={reminder.id}"
								class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 text-sm transition-colors hover:bg-accent/40"
							>
								<span class="text-foreground"
									>{formatRecurrence(reminder, locale, 'full') ||
										t(locale, 'page.medications.once')}</span
								>
								<span class="text-xs text-muted-foreground"
									><LocalTime date={reminder.dueAt} format="datetime" /></span
								>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section aria-labelledby="dose-history">
			<h2 id="dose-history" class={sectionHeading}>
				{t(locale, 'page.medications.doseHistory')}
			</h2>
			{#if data.doses.length === 0}
				<p class="rounded-2xl border bg-card px-5 py-4 text-sm text-muted-foreground">
					{t(locale, 'page.medications.noDoses')}
				</p>
			{:else}
				<ul class="divide-y divide-border rounded-2xl border bg-card">
					{#each data.doses as dose (dose.id)}
						<li class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
							<span class="font-medium text-foreground"
								><LocalTime date={dose.givenAt} format="datetime" /></span
							>
							{#if dose.givenBy}
								<span class="text-muted-foreground"
									>{t(locale, 'page.medications.givenBy', {
										name: dose.givenBy.displayName
									})}</span
								>
							{/if}
							<Badge variant={dose.source === 'reminder' ? 'teal' : 'secondary'} class="ml-auto">
								{dose.source === 'reminder'
									? t(locale, 'page.medications.fromReminder')
									: t(locale, 'page.medications.loggedByHand')}
							</Badge>
							{#if caps.canEdit}
								<Button
									variant="ghost"
									size="icon-sm"
									class="text-muted-foreground"
									aria-label={t(locale, 'page.medications.removeDoseLabel')}
									title={t(locale, 'page.medications.removeDoseLabel')}
									onclick={() => (removeDoseId = dose.id)}
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							{/if}
							{#if dose.note}
								<p class="w-full text-xs text-muted-foreground">{dose.note}</p>
							{/if}
						</li>
					{/each}
				</ul>
				{#if data.moreDoses}
					<div class="mt-3 flex justify-center">
						<Button variant="soft" size="sm" href="?doses={data.moreDoses}" data-sveltekit-noscroll>
							{t(locale, 'page.medications.showMore')}
						</Button>
					</div>
				{/if}
			{/if}
		</section>

		<form bind:this={endForm} method="POST" action="?/end" use:enhance class="hidden"></form>
		<form bind:this={deleteForm} method="POST" action="?/delete" class="hidden"></form>
		<ConfirmDialog
			open={confirmEnd}
			message={t(locale, 'page.medications.endConfirm', { name: med.name })}
			confirmLabel={t(locale, 'page.medications.endConfirmButton')}
			onconfirm={() => {
				confirmEnd = false;
				endForm?.requestSubmit();
			}}
			oncancel={() => (confirmEnd = false)}
		/>
		<form bind:this={removeDoseForm} method="POST" action="?/deleteDose" use:enhance class="hidden">
			<input type="hidden" name="doseId" value={removeDoseId ?? ''} />
		</form>
		<ConfirmDialog
			open={removeDoseId !== null}
			message={t(locale, 'page.medications.removeDoseConfirm')}
			confirmLabel={t(locale, 'page.medications.removeDose')}
			onconfirm={() => {
				removeDoseForm?.requestSubmit();
				removeDoseId = null;
			}}
			oncancel={() => (removeDoseId = null)}
		/>
		<ConfirmDialog
			open={confirmDelete}
			message={t(locale, 'page.medications.deleteConfirm', { name: med.name })}
			onconfirm={() => {
				confirmDelete = false;
				deleteForm?.requestSubmit();
			}}
			oncancel={() => (confirmDelete = false)}
		/>
	{/if}
</div>
