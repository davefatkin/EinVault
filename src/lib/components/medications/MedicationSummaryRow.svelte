<script lang="ts">
	import { getContext } from 'svelte';
	import { Pencil, Pill } from '@lucide/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import MedicationFacts from './MedicationFacts.svelte';
	import MedicationGivenButton from './MedicationGivenButton.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		endsByToday,
		todayInZone,
		type MedicationCaps,
		type MedicationSummary
	} from '#lib/medications.js';

	// One medication in a list: the medications page, the dashboard card and
	// the caretaker card. caps decide what the viewer may do here.
	let {
		medication,
		caps,
		givenAction,
		detailHref
	}: {
		medication: MedicationSummary;
		caps: MedicationCaps;
		givenAction: string;
		detailHref?: string;
	} = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');
	// Over on its end day, though a dose can still be logged until midnight.
	const ended = $derived(endsByToday(medication.endedOn, todayInZone(timeZone)));
</script>

<div class="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4">
	<div class="flex min-w-0 flex-1 items-start gap-3">
		<span
			class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg {ended
				? 'bg-muted text-muted-foreground'
				: 'bg-primary/10 text-primary'}"
			aria-hidden="true"
		>
			<Pill class="h-4 w-4" />
		</span>
		<div class="min-w-0 flex-1 space-y-1">
			<div class="flex flex-wrap items-center gap-2">
				{#if detailHref}
					<a href={detailHref} class="font-medium text-foreground break-words hover:underline"
						>{medication.name}</a
					>
				{:else}
					<span class="font-medium text-foreground break-words">{medication.name}</span>
				{/if}
				{#if ended}
					<Badge variant="secondary">{t(locale, 'page.medications.endedBadge')}</Badge>
				{/if}
			</div>
			<MedicationFacts {medication} />
		</div>
	</div>
	{#if (caps.canEdit && detailHref) || (caps.canLogDose && medication.active)}
		<div class="flex shrink-0 items-center gap-1 self-end sm:self-auto">
			{#if caps.canEdit && detailHref}
				<Button
					variant="soft"
					size="icon-sm"
					href="{detailHref}?edit=1"
					aria-label={t(locale, 'common.edit')}
					title={t(locale, 'common.edit')}
				>
					<Pencil class="h-4 w-4" />
				</Button>
			{/if}
			{#if caps.canLogDose && medication.active}
				<MedicationGivenButton {medication} action={givenAction} />
			{/if}
		</div>
	{/if}
</div>
