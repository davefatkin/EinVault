<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	interface Props {
		src: string;
		downloadName?: string | null;
		label?: string;
		class?: string;
		autoplay?: boolean;
		/** Compact fallback for small thumbnails: hides the message, shows only the download link. */
		compact?: boolean;
	}

	let {
		src,
		downloadName = null,
		label,
		class: className = '',
		autoplay = false,
		compact = false
	}: Props = $props();
	const locale = getLocale();

	// Browsers can't decode every container/codec we accept (videos are stored
	// as-is, no transcode). On a decode/metadata error, fall back to a download
	// link instead of a dead player.
	let failed = $state(false);

	// Honor the user's reduced-motion preference: don't auto-start playback.
	const reduceMotion =
		typeof window !== 'undefined' &&
		!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
</script>

{#if failed}
	<div
		class="flex flex-col items-center justify-center gap-1.5 bg-stone-100 dark:bg-stone-800 text-center {compact
			? 'p-2'
			: 'p-3'} {className}"
	>
		{#if !compact}
			<p class="text-xs text-muted-foreground">{t(locale, 'page.journal.videoUnsupported')}</p>
		{/if}
		<a
			href={src}
			download={downloadName ?? true}
			class="inline-flex items-center gap-1 rounded px-2 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
		>
			<Download class="h-3.5 w-3.5 shrink-0" />
			{t(locale, 'aria.downloadMedia')}
		</a>
	</div>
{:else}
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		{src}
		controls
		autoplay={autoplay && !reduceMotion}
		preload="metadata"
		playsinline
		class={className}
		aria-label={label ?? t(locale, 'page.journal.videoAlt')}
		onerror={() => (failed = true)}
	></video>
{/if}
