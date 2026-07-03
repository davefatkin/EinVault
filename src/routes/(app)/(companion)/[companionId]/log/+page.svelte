<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { page } from '$app/state';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { Activity } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import DailyLogForm from '$lib/components/log/DailyLogForm.svelte';
	import TodayEventsList from '$lib/components/log/TodayEventsList.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();

	const initialType = page.url.searchParams.get('type') ?? 'walk';

	// Admins can delete anyone's entry; members only their own.
	const canDelete = (event: { loggedBy: string | null }) =>
		data.user?.role === 'admin' || event.loggedBy === data.user?.id;
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
			<TodayEventsList events={data.todayEvents} currentUserId={data.user?.id} {canDelete} />
		</CardContent>
	</Card>
</div>
