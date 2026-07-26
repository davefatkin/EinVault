<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import { Check, HeartPulse, SkipForward } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		onDone: () => void;
		onDoneAndLog?: () => void;
		onSkip?: () => void;
		allowLogEvent: boolean;
		isRecurring?: boolean;
	}

	let { onDone, onDoneAndLog, onSkip, allowLogEvent, isRecurring = false }: Props = $props();

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
	{#if isRecurring && onSkip}
		<Button
			type="button"
			variant="soft"
			size="icon-sm"
			onclick={onSkip}
			aria-label={t(locale, 'common.reminder.skipAria')}
			title={t(locale, 'common.reminder.skip')}
		>
			<SkipForward class="h-4 w-4" />
		</Button>
	{/if}
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
