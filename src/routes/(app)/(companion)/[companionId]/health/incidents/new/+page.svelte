<script lang="ts">
	import IncidentCreate from '#lib/components/incidents/IncidentCreate.svelte';
	import { incidentPath } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.incident.newTitle')} | {data.companion.name} | EinVault</title>
</svelte:head>

<IncidentCreate
	companionId={data.companion.id}
	backHref="/{data.companion.id}/health"
	backLabel={t(locale, 'page.health.title')}
	nextHref={(id) => incidentPath(data.companion.id, id)}
	allowStart
	showReminder
	uploadMaxMb={data.uploadMaxMb}
	videoMaxMb={data.videoMaxMb}
	formError={form?.error}
/>
