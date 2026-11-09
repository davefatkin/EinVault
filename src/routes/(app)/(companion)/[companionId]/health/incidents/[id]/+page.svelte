<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import IncidentDetail from '#lib/components/incidents/IncidentDetail.svelte';
	import { incidentMediaUrl, type MediaItem } from '#lib/media.js';
	import type { IncidentCaps } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();

	// Owners may do everything; an archived companion is read-only here, as on
	// the Health Log. New updates go on open incidents only.
	const active = $derived(data.companion.isActive !== false);
	const caps: IncidentCaps = $derived({
		canEditOverview: active,
		canAddUpdate: active && data.detail.incident.resolvedAt === null,
		canResolve: active,
		canLink: active,
		canDelete: active,
		canEditUpdate: () => active
	});
	const forms = {
		addUpdate: '?/addUpdate',
		editUpdate: '?/editUpdate',
		deleteUpdate: '?/deleteUpdate',
		resolve: '?/resolve',
		reopen: '?/reopen',
		editOverview: '?/editOverview',
		delete: '?/delete',
		link: '?/link',
		unlink: '?/unlink'
	};
	const mediaUrl = (item: MediaItem) =>
		incidentMediaUrl(data.companion.id, data.detail.incident.id, item);
</script>

<svelte:head>
	<title>{data.detail.incident.title} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4 pb-20 md:pb-0">
	<a
		href="/{data.companion.id}/health"
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
	>
		<ChevronLeft class="h-4 w-4" />
		{t(locale, 'page.health.title')}
	</a>
	<!-- A printout needs to say whose incident it is. -->
	<p class="hidden text-sm font-medium print:block">
		{data.companion.name} · {t(locale, 'page.health.title')}
	</p>
	{#if !active}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground print:hidden">
			{t(locale, 'page.health.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}
	{#if form && 'error' in form && form.error}
		<Alert variant="coral" class="print:hidden"
			><AlertDescription>{form.error}</AlertDescription></Alert
		>
	{/if}
	{#key data.detail.incident.id}
		<IncidentDetail
			data={data.detail}
			companionId={data.companion.id}
			{caps}
			{mediaUrl}
			{forms}
			uploadMaxMb={data.uploadMaxMb}
			videoMaxMb={data.videoMaxMb}
			currentUserId={data.user?.id ?? ''}
			allowTime
		/>
	{/key}
</div>
