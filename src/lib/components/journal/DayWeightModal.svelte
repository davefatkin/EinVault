<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { invalidateAll } from '$app/navigation';
	import Modal from '$lib/components/Modal.svelte';
	import WeightForm from '$lib/components/health/WeightForm.svelte';
	import type { WeightUnit } from '$lib/activityTypes';
	import { t, getLocale } from '$lib/i18n';

	// "+ Weight" on the journal day, saved through ?/addWeight.
	let {
		defaultAt,
		defaultUnit,
		flush,
		onclose
	}: {
		defaultAt: string;
		defaultUnit: WeightUnit;
		flush: () => Promise<void>;
		onclose: () => void;
	} = $props();
	const locale = getLocale();

	let submitting = $state(false);
	let error = $state<string | null>(null);

	const submit: SubmitFunction = async () => {
		await flush();
		submitting = true;
		error = null;
		return async ({ result }) => {
			if (result.type === 'success') {
				await invalidateAll();
				submitting = false;
				onclose();
				return;
			}
			submitting = false;
			error =
				result.type === 'failure'
					? String(result.data?.weightError ?? t(locale, 'media.actionFailed'))
					: t(locale, 'media.actionFailed');
		};
	};
</script>

<Modal title={t(locale, 'page.health.logWeightTitle')} {onclose} locked={submitting}>
	{#if error}
		<p role="alert" class="mb-3 text-sm text-destructive">{error}</p>
	{/if}
	<WeightForm
		action="?/addWeight"
		{defaultAt}
		{defaultUnit}
		{submit}
		{submitting}
		oncancel={onclose}
	/>
</Modal>
