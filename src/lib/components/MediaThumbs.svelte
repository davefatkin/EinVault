<script lang="ts">
	// Read-only thumbnail row. The page owns the lightbox and opens it via
	// `onopen`, so a page with many rows (care page) has one lightbox.
	import { Play } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import type { MediaItem } from '$lib/media';

	interface Props {
		items: MediaItem[];
		urlFor: (item: MediaItem) => string;
		onopen: (index: number) => void;
		/** Show at most this many; the last one carries a +N overlay and opens at index `max`. */
		max?: number;
	}

	let { items, urlFor, onopen, max }: Props = $props();
	const locale = getLocale();

	let limit = $derived(max ?? items.length);
	let visible = $derived(items.slice(0, limit));
	let overflow = $derived(Math.max(0, items.length - limit));

	function label(item: MediaItem): string {
		return (
			item.originalName ??
			t(locale, item.mediaType === 'video' ? 'media.videoAlt' : 'media.photoAlt')
		);
	}
</script>

{#if items.length > 0}
	<div class="flex flex-wrap gap-1.5">
		{#each visible as item, i (item.id)}
			<button
				type="button"
				onclick={() => onopen(i === limit - 1 && overflow > 0 ? limit : i)}
				class="relative h-16 w-16 overflow-hidden rounded-lg transition-opacity hover:opacity-90"
				title={label(item)}
				aria-label={label(item)}
			>
				{#if item.mediaType === 'video' && item.posterKey}
					<img
						src={`${urlFor(item)}?poster`}
						alt={item.originalName ?? ''}
						class="h-full w-full object-cover"
						loading="lazy"
					/>
				{:else if item.mediaType === 'video'}
					<video
						src={urlFor(item)}
						preload="metadata"
						muted
						playsinline
						aria-hidden="true"
						class="h-full w-full object-cover"
					></video>
				{:else}
					<img
						src={urlFor(item)}
						alt={item.originalName ?? ''}
						class="h-full w-full object-cover"
						loading="lazy"
					/>
				{/if}
				{#if item.mediaType === 'video'}
					<span
						class="absolute inset-0 flex items-center justify-center bg-black/20"
						aria-hidden="true"
						><span class="rounded-full bg-black/55 p-1.5"><Play class="h-4 w-4 text-white" /></span
						></span
					>
				{/if}
				{#if i === limit - 1 && overflow > 0}
					<span
						class="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold text-white"
						>+{overflow}</span
					>
				{/if}
			</button>
		{/each}
	</div>
{/if}
