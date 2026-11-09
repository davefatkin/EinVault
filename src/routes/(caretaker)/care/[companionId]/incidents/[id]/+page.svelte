<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { Alert, AlertDescription } from '#lib/components/ui/alert/index.js';
	import IncidentDetail from '#lib/components/incidents/IncidentDetail.svelte';
	import { incidentMediaUrl, type MediaItem } from '#lib/media.js';
	import type { IncidentCaps, UpdateView } from '#lib/incidents.js';
	import { localDateISO } from '#lib/date.js';

	let { data, form } = $props();

	// The server is the gate (checkIncidentWrite); these only decide what to
	// offer. On shift a caretaker adds updates and edits their own from today.
	const caps: IncidentCaps = $derived({
		canEditOverview: false,
		canAddUpdate: data.isOnShift,
		canResolve: false,
		canLink: false,
		canAttachDocuments: false,
		canDelete: false,
		canEditUpdate: (u: UpdateView) =>
			data.isOnShift && u.loggedBy === data.user.id && localDateISO(u.createdAt) === localDateISO()
	});
	const forms = {
		addUpdate: '?/addUpdate',
		editUpdate: '?/editUpdate',
		deleteUpdate: '?/deleteUpdate'
	};
	const mediaUrl = (item: MediaItem) =>
		incidentMediaUrl(data.companion.id, data.detail.incident.id, item);
</script>

<svelte:head>
	<title>{data.detail.incident.title} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="mx-auto max-w-3xl space-y-4">
	<a
		href="/care/{data.companion.id}"
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
	>
		<ChevronLeft class="h-4 w-4" />
		{data.companion.name}
	</a>
	<p class="hidden text-sm font-medium print:block">{data.companion.name}</p>
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
			currentUserId={data.user.id}
		/>
	{/key}
</div>
