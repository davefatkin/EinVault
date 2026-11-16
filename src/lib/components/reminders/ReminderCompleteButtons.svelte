<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import { Check, HeartPulse, SkipForward, Undo2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		onDone: () => void;
		onDoneAndLog?: () => void;
		onSkip?: () => void;
		// Present when there's a committed dose to take back; stays visible
		// (unlike the undo toast) until the dose is taken back or superseded.
		onMistap?: () => void;
		allowLogEvent: boolean;
		isRecurring?: boolean;
	}

	let {
		onDone,
		onDoneAndLog,
		onSkip,
		onMistap,
		allowLogEvent,
		isRecurring = false
	}: Props = $props();

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
	{#if onMistap}
		<Button
			type="button"
			variant="soft"
			class="h-8 gap-1 rounded-lg px-2 text-xs"
			onclick={onMistap}
			aria-label={t(locale, 'common.reminder.mistapAria')}
			title={t(locale, 'common.reminder.mistapAria')}
		>
			<Undo2 class="h-3.5 w-3.5" />
			{t(locale, 'common.reminder.mistap')}
		</Button>
	{/if}
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
