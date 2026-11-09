<script lang="ts">
	import IncidentPage from '#lib/components/incidents/IncidentPage.svelte';
	import { incidentMediaUrl, type MediaItem } from '#lib/media.js';
	import { OWNER_INCIDENT_FORMS, ownerIncidentCaps } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();

	const active = $derived(data.companion.isActive !== false);
	const caps = $derived(
		ownerIncidentCaps({ active, resolved: data.detail.incident.resolvedAt !== null })
	);
	const mediaUrl = (item: MediaItem) =>
		incidentMediaUrl(data.companion.id, data.detail.incident.id, item);
</script>

<svelte:head>
	<title>{data.detail.incident.title} | {data.companion.name} | EinVault</title>
</svelte:head>

<IncidentPage
	class="pb-20 md:pb-0"
	backHref="/{data.companion.id}/health"
	backLabel={t(locale, 'page.health.title')}
	printLabel="{data.companion.name} · {t(locale, 'page.health.title')}"
	error={form && 'error' in form ? form.error : null}
	detail={{
		data: data.detail,
		companionId: data.companion.id,
		caps,
		mediaUrl,
		forms: OWNER_INCIDENT_FORMS,
		linkCandidates: data.linkCandidates,
		paperlessEnabled: data.paperlessEnabled,
		uploadMaxMb: data.uploadMaxMb,
		videoMaxMb: data.videoMaxMb,
		currentUserId: data.user?.id ?? '',
		allowTime: true
	}}
>
	{#snippet notice()}
		{#if !active}
			<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground print:hidden">
				{t(locale, 'page.health.archivedNotice', { name: data.companion.name })}
			</div>
		{/if}
	{/snippet}
</IncidentPage>
