<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { Zap } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import QuickLogsManager from '$lib/components/settings/QuickLogsManager.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'quickLogs.title')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<PageHeader
		title={t(locale, 'quickLogs.title')}
		subtitle={t(locale, 'quickLogs.subtitle')}
		tint="gold"
	>
		{#snippet icon()}<Zap class="h-5 w-5" />{/snippet}
	</PageHeader>

	<QuickLogsManager
		quickLogs={data.quickLogs}
		companions={data.quickLogCompanions}
		shareableUsers={data.shareableUsers}
		{form}
	/>
</div>
