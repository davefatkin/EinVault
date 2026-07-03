<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { page } from '$app/state';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { Activity, Lock } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DailyLogForm from '$lib/components/log/DailyLogForm.svelte';
	import TodayEventsList from '$lib/components/log/TodayEventsList.svelte';
	import { t, getLocale } from '$lib/i18n';

	// isOnShift and nextShift come from the caretaker layout data

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();

	const initialType = page.url.searchParams.get('type') ?? 'walk';
</script>

<svelte:head>
	<title>{t(locale, 'page.log.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="space-y-5">
	<PageHeader
		title={t(locale, 'page.log.title')}
		subtitle={t(locale, 'page.log.subtitle', { name: data.companion.name })}
		tint="gold"
	>
		{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if !data.isOnShift}
		<Card>
			<CardContent class="py-4">
				<EmptyState tint="muted" title={t(locale, 'page.log.noActiveShift')}>
					{#snippet icon()}<Lock class="h-5 w-5" />{/snippet}
				</EmptyState>
				{#if data.nextShift}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.log.nextShiftStarts')}
						<LocalTime date={data.nextShift.startAt} format="datetime" />.
					</p>
				{:else}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.log.noUpcomingShifts')}
					</p>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<!-- Quick log -->
		<Card>
			<CardHeader class="pb-3">
				<h2 class="font-semibold">{t(locale, 'page.log.quickLogTitle')}</h2>
			</CardHeader>
			<CardContent>
				<DailyLogForm
					companions={data.companions ?? []}
					primaryCompanion={data.companion}
					{initialType}
					{form}
				/>
			</CardContent>
		</Card>

		<!-- Today's log -->
		<Card>
			<CardHeader class="pb-3">
				<h2 class="font-semibold">{t(locale, 'page.log.todaySoFar')}</h2>
			</CardHeader>
			<CardContent>
				<TodayEventsList events={data.todayEvents} currentUserId={data.user?.id} />
			</CardContent>
		</Card>
	{/if}
</div>
