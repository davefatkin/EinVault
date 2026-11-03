<script lang="ts">
	import { getContext } from 'svelte';
	import { getLocale } from '#lib/i18n/index.js';
	import { formatLocalTime, type LocalTimeFormat, type LocalTimeInput } from './localTime.js';

	interface Props {
		date: LocalTimeInput;
		format?: LocalTimeFormat;
		fallback?: string;
	}

	let { date, format = 'date', fallback = '-' }: Props = $props();
	const locale = getLocale();

	// Use the server's timezone so all users see times in the household's timezone,
	// regardless of where their browser is located. SSR formats with the same zone
	// and locale, so the hydrated text matches the server-rendered text.
	const timeZone = getContext<string | undefined>('serverTimezone');

	let formatted = $derived(formatLocalTime(date, { format, locale, timeZone }));
</script>

<time datetime={formatted?.datetime} class="tabular-nums">{formatted?.display ?? fallback}</time>
