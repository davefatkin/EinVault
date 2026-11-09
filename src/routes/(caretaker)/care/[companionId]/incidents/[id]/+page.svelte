<script lang="ts">
	import IncidentPage from '#lib/components/incidents/IncidentPage.svelte';
	import { incidentMediaUrl, type MediaItem } from '#lib/media.js';
	import { CARETAKER_INCIDENT_FORMS, caretakerIncidentCaps } from '#lib/incidents.js';

	let { data, form } = $props();

	const caps = $derived(caretakerIncidentCaps({ isOnShift: data.isOnShift, userId: data.user.id }));
	const mediaUrl = (item: MediaItem) =>
		incidentMediaUrl(data.companion.id, data.detail.incident.id, item);
</script>

<svelte:head>
	<title>{data.detail.incident.title} | {data.companion.name} | EinVault</title>
</svelte:head>

<IncidentPage
	backHref="/care/{data.companion.id}"
	backLabel={data.companion.name}
	printLabel={data.companion.name}
	error={form && 'error' in form ? form.error : null}
	detail={{
		data: data.detail,
		companionId: data.companion.id,
		caps,
		mediaUrl,
		forms: CARETAKER_INCIDENT_FORMS,
		uploadMaxMb: data.uploadMaxMb,
		videoMaxMb: data.videoMaxMb,
		currentUserId: data.user.id
	}}
/>
