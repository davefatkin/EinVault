<script lang="ts">
	import { getContext } from 'svelte';
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import { Check } from '@lucide/svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { addToast } from '#lib/components/ui/toast/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { doseCovered, todayInZone, type MedicationSummary } from '#lib/medications.js';

	// Logs a dose given now. The action completes a dose reminder due today
	// when there is one, so the same button works on and off schedule. Once the
	// current dose looks covered (see doseCovered) it turns quiet, shows when it
	// was given, and asks before logging another, so two people don't both give
	// the same dose.
	let {
		medication,
		action
	}: {
		medication: Pick<MedicationSummary, 'id' | 'name' | 'lastGiven' | 'nextDueAt'>;
		action: string;
	} = $props();
	const locale = getLocale();
	const timeZone = getContext<string | undefined>('serverTimezone');
	let submitting = $state(false);
	let confirming = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	// Recomputed whenever the page data refreshes (after a tap or navigation).
	const covered = $derived(doseCovered(medication, new Date(), timeZone));
	// "8:05 AM" when given today, else "Nov 1".
	const givenWhen = $derived.by(() => {
		if (!medication.lastGiven) return '';
		const at = new Date(medication.lastGiven.at);
		const tz = timeZone ? { timeZone } : {};
		return todayInZone(timeZone, at) === todayInZone(timeZone)
			? at.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', ...tz })
			: at.toLocaleDateString(locale, { month: 'short', day: 'numeric', ...tz });
	});
	const confirmMessage = $derived(
		medication.lastGiven?.by
			? t(locale, 'page.medications.givenAgainConfirmBy', {
					name: medication.name,
					when: givenWhen,
					by: medication.lastGiven.by.displayName
				})
			: t(locale, 'page.medications.givenAgainConfirm', {
					name: medication.name,
					when: givenWhen
				})
	);
</script>

<form
	bind:this={formEl}
	method="POST"
	{action}
	use:enhance={() => {
		submitting = true;
		return async ({ result, update }) => {
			if (result.type === 'success')
				addToast({
					title: t(locale, 'page.medications.doseLogged', { name: medication.name }),
					durationMs: 4000
				});
			if (result.type === 'failure') {
				// Say why (ended, off shift...) and refresh what the page shows. Not
				// update(): that would also put the message in `form` for the page.
				addToast({
					id: 'medication-given-error',
					title: String(result.data?.error ?? t(locale, 'media.actionFailed')),
					durationMs: 6000
				});
				await refreshAll();
			} else {
				await update();
			}
			submitting = false;
		};
	}}
>
	<input type="hidden" name="id" value={medication.id} />
	{#if covered}
		<Button
			type="button"
			variant="soft"
			size="sm"
			disabled={submitting}
			title={t(locale, 'page.medications.givenAgainTitle')}
			onclick={() => (confirming = true)}
		>
			<Check class="h-4 w-4 mr-1.5 text-teal" />{t(locale, 'page.medications.givenAt', {
				when: givenWhen
			})}
		</Button>
	{:else}
		<Button
			type="submit"
			variant="softSuccess"
			size="sm"
			disabled={submitting}
			title={t(locale, 'page.medications.givenTitle')}
		>
			<Check class="h-4 w-4 mr-1.5" />{t(locale, 'page.medications.given')}
		</Button>
	{/if}
</form>
<ConfirmDialog
	open={confirming}
	message={confirmMessage}
	confirmLabel={t(locale, 'page.medications.givenAgainButton')}
	confirmVariant="softSuccess"
	onconfirm={() => {
		confirming = false;
		formEl?.requestSubmit();
	}}
	oncancel={() => (confirming = false)}
/>
