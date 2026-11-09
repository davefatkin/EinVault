<script lang="ts">
	import { refreshAll } from '$app/navigation';
	import Modal from '#lib/components/Modal.svelte';
	import IncidentCreateForm from './IncidentCreateForm.svelte';
	import { incidentPath } from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// "+ Add > Incident" on the journal day: the shared create form in a modal.
	// The incident shows up as a chip on its start day once the page refreshes.
	let {
		companionId,
		defaultStart,
		uploadMaxMb,
		videoMaxMb,
		flush,
		onclose
	}: {
		companionId: string;
		defaultStart: Date;
		uploadMaxMb: number;
		videoMaxMb: number;
		/** Saves the day's unsaved journal text before the POST. */
		flush: () => Promise<void>;
		onclose: () => void;
	} = $props();
	const locale = getLocale();

	let saving = $state(false);
	let gone = false;
	$effect(() => () => {
		gone = true;
	});

	async function finish() {
		await refreshAll();
		if (!gone) onclose();
	}
</script>

<Modal title={t(locale, 'page.incident.newTitle')} {onclose} locked={saving}>
	<IncidentCreateForm
		{companionId}
		action="?/addIncident"
		nextHref={(id) => incidentPath(companionId, id)}
		onfinish={finish}
		oncancel={onclose}
		beforeSubmit={flush}
		{defaultStart}
		onphase={(p) => (saving = p === 'saving')}
		allowStart
		{uploadMaxMb}
		{videoMaxMb}
	/>
</Modal>
