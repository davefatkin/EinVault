<script lang="ts">
	import IncidentCreate from '#lib/components/incidents/IncidentCreate.svelte';
	import { careIncidentPath } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data, form } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.incident.newTitle')} | {data.companion.name} | EinVault</title>
</svelte:head>

<IncidentCreate
	companionId={data.companion.id}
	backHref="/care/{data.companion.id}"
	backLabel={data.companion.name}
	nextHref={(id) => careIncidentPath(data.companion.id, id)}
	allowStart={false}
	uploadMaxMb={data.uploadMaxMb}
	videoMaxMb={data.videoMaxMb}
	formError={form?.error}
/>
