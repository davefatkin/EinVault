<script lang="ts">
	import { Download } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	interface Props {
		src: string;
		downloadName?: string | null;
		label?: string;
		class?: string;
		autoplay?: boolean;
	}

	let {
		src,
		downloadName = null,
		label,
		class: className = '',
		autoplay = false
	}: Props = $props();
	const locale = getLocale();

	// Browsers can't decode every container/codec we accept (videos are stored
	// as-is, no transcode). On a decode/metadata error, fall back to a download
	// link instead of a dead player.
	let failed = $state(false);
</script>

{#if failed}
	<div
		class="flex flex-col items-center justify-center gap-1.5 bg-stone-100 dark:bg-stone-800 text-center p-3 {className}"
	>
		<p class="text-xs text-muted-foreground">{t(locale, 'page.journal.videoUnsupported')}</p>
		<a
			href={src}
			download={downloadName ?? true}
			class="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-300 hover:underline"
		>
			<Download class="h-3.5 w-3.5" />
			{t(locale, 'aria.downloadMedia')}
		</a>
	</div>
{:else}
	<!-- svelte-ignore a11y_media_has_caption -->
	<video
		{src}
		controls
		{autoplay}
		preload="metadata"
		playsinline
		class={className}
		aria-label={label ?? t(locale, 'page.journal.videoAlt')}
		onerror={() => (failed = true)}
	></video>
{/if}
