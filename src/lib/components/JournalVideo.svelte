<script lang="ts">
	import { Download, Loader2 } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	interface Props {
		src: string;
		downloadName?: string | null;
		label?: string;
		class?: string;
		autoplay?: boolean;
		/** Compact fallback for small thumbnails: hides the message, shows only the download link. */
		compact?: boolean;
		/**
		 * Transcode lifecycle of the row. 'processing'/'claimed' shows a converting
		 * placeholder; anything else renders the player. A 'failed' transcode leaves
		 * the row pointing at the original upload, so we still try to play it and let
		 * the decode-error fallback handle an unsupported codec.
		 */
		status?: string;
		/** Poster image URL (the transcoded video's generated thumbnail), if any. */
		poster?: string | null;
	}

	let {
		src,
		downloadName = null,
		label,
		class: className = '',
		autoplay = false,
		compact = false,
		status = 'ready',
		poster = null
	}: Props = $props();
	const locale = getLocale();

	// Browsers can't decode every container/codec we accept (videos are stored
	// as-is, no transcode). On a decode/metadata error, fall back to a download
	// link instead of a dead player.
	let failed = $state(false);

	// A queued/in-flight transcode has no playable transcoded file yet. Show a
	// converting placeholder; the journal page polls and swaps in the player.
	const processing = $derived(status === 'processing' || status === 'claimed');

	// Honor the user's reduced-motion preference: don't auto-start playback.
	const reduceMotion =
		typeof window !== 'undefined' &&
		!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
</script>

{#if processing}
	<div
		class="flex flex-col items-center justify-center gap-1.5 bg-stone-100 dark:bg-stone-800 text-center {compact
			? 'p-2'
			: 'p-3'} {className}"
	>
		<Loader2 class="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
		{#if !compact}
			<p class="text-xs text-muted-foreground">{t(locale, 'page.journal.videoProcessing')}</p>
		{/if}
	</div>
{:else if failed}
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
		poster={poster ?? undefined}
		controls
		autoplay={autoplay && !reduceMotion}
		preload="metadata"
		playsinline
		class={className}
		aria-label={label ?? t(locale, 'page.journal.videoAlt')}
		onerror={() => (failed = true)}
	></video>
{/if}
