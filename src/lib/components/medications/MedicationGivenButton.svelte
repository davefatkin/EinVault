<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { addToast } from '#lib/components/ui/toast/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Logs a dose given now. The action completes a dose reminder due today
	// when there is one, so the same button works on and off schedule.
	let { medication, action }: { medication: { id: string; name: string }; action: string } =
		$props();
	const locale = getLocale();
	let submitting = $state(false);
</script>

<form
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
			await update();
			submitting = false;
		};
	}}
>
	<input type="hidden" name="id" value={medication.id} />
	<Button
		type="submit"
		variant="softSuccess"
		size="sm"
		disabled={submitting}
		title={t(locale, 'page.medications.givenTitle')}
	>
		<Check class="h-4 w-4 mr-1.5" />{t(locale, 'page.medications.given')}
	</Button>
</form>
