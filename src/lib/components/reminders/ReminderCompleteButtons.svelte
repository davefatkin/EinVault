<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import { Check, HeartPulse } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		onDone: () => void;
		onDoneAndLog?: () => void;
		allowLogEvent: boolean;
	}

	let { onDone, onDoneAndLog, allowLogEvent }: Props = $props();

	const locale = getLocale();
</script>

<div class="flex items-center gap-1 shrink-0">
	<Button
		type="button"
		variant="softSuccess"
		size="icon-sm"
		onclick={onDone}
		aria-label={t(locale, 'overview.markDone')}
		title={t(locale, 'common.reminder.done')}
	>
		<Check class="h-4 w-4" />
	</Button>
	{#if allowLogEvent && onDoneAndLog}
		<Button
			type="button"
			variant="softPrimary"
			size="icon-sm"
			onclick={onDoneAndLog}
			aria-label={t(locale, 'common.reminder.logEventAria')}
			title={t(locale, 'common.reminder.logEvent')}
		>
			<HeartPulse class="h-4 w-4" />
		</Button>
	{/if}
</div>
