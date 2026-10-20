<script lang="ts">
	import type { SubmitFunction } from '$app/forms';
	import { untrack } from 'svelte';
	import { refreshAll } from '$app/navigation';
	import Modal from '#lib/components/Modal.svelte';
	import WeightForm from '#lib/components/health/WeightForm.svelte';
	import type { WeightUnit } from '#lib/activityTypes.js';
	import { t, getLocale } from '#lib/i18n/index.js';

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
	// Read once: a background refresh must not reset a date typed by hand.
	const initialAt = untrack(() => defaultAt);

	// Set when the modal unmounts, e.g. Back changed the day mid-save, so a
	// late save can't close a modal opened on the new day.
	let gone = false;
	$effect(() => () => {
		gone = true;
	});

	let submitting = $state(false);
	let error = $state<string | null>(null);

	const submit: SubmitFunction = async ({ cancel }) => {
		if (submitting) {
			cancel();
			return;
		}
		submitting = true;
		error = null;
		try {
			await flush();
		} catch {
			submitting = false;
			error = t(locale, 'media.actionFailed');
			cancel();
			return;
		}
		return async ({ result }) => {
			if (result.type === 'success') {
				try {
					await refreshAll();
				} finally {
					submitting = false;
					if (!gone) onclose();
				}
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
		defaultAt={initialAt}
		{defaultUnit}
		{submit}
		{submitting}
		oncancel={onclose}
	/>
</Modal>
