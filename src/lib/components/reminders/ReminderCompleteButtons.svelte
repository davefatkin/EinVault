<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import { Check, HeartPulse } from '@lucide/svelte';

	interface Props {
		onDone: () => void;
		onDoneAndLog?: () => void;
		allowLogEvent: boolean;
	}

	let { onDone, onDoneAndLog, allowLogEvent }: Props = $props();

	const locale = getLocale();
</script>

<div class="flex items-center gap-1 shrink-0">
	<button
		type="button"
		onclick={onDone}
		class="shrink-0 h-8 w-8 rounded-lg border border-border bg-teal/10 text-teal flex items-center justify-center hover:bg-teal/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		aria-label={t(locale, 'overview.markDone')}
		title={t(locale, 'common.reminder.done')}
	>
		<Check class="h-4 w-4" />
	</button>
	{#if allowLogEvent && onDoneAndLog}
		<button
			type="button"
			onclick={onDoneAndLog}
			class="shrink-0 h-8 w-8 rounded-lg border border-border bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={t(locale, 'common.reminder.logEventAria')}
			title={t(locale, 'common.reminder.logEvent')}
		>
			<HeartPulse class="h-4 w-4" />
		</button>
	{/if}
</div>
