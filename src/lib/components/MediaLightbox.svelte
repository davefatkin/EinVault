<script lang="ts">
	import { tick } from 'svelte';
	import { ChevronLeft, ChevronRight, X, Download } from '@lucide/svelte';
	import JournalVideo from '$lib/components/JournalVideo.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { t, getLocale } from '$lib/i18n';
	import type { UserRef } from '$lib/types';

	const locale = getLocale();

	type MediaItem = {
		id: string;
		filename: string;
		originalName: string | null;
		mediaType: 'photo' | 'video';
		notes: string | null;
		status: string;
		posterKey: string | null;
		logger: UserRef;
		[key: string]: unknown;
	};

	interface Props {
		/** The companion ID, used to build /api/photos/journal/:companionId/:date/:filename URLs. */
		companionId: string;
		/** The media items to page through. */
		items: MediaItem[];
		/** Active item index — caller can set the start index. */
		index?: number;
		/** Entry date (YYYY-MM-DD), needed to build media URLs. */
		date: string;
		/** Whether the lightbox is visible. */
		open?: boolean;
	}

	let {
		companionId,
		items = [],
		index = $bindable(0),
		date,
		open = $bindable(false)
	}: Props = $props();

	let lightboxEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	let item = $derived(open && items.length > 0 ? items[index] : null);

	// Capture the trigger when the lightbox opens so focus can be restored on close.
	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			tick().then(() => lightboxEl?.focus());
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});

	function mediaUrl(it: MediaItem) {
		return `/api/photos/journal/${companionId}/${date}/${it.filename}`;
	}

	function posterUrl(it: MediaItem) {
		return it.posterKey ? `${mediaUrl(it)}?poster` : null;
	}

	function close() {
		open = false;
		index = 0;
	}

	function prev() {
		if (index > 0) index--;
	}

	function next() {
		if (index < items.length - 1) index++;
	}

	function handleKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			// The lightbox is the topmost overlay; consume Escape so a sibling
			// window handler (e.g. the journal page's activity-detail modal) can't
			// also close on the same keypress regardless of listener order.
			e.stopImmediatePropagation();
			close();
		} else if (e.key === 'ArrowLeft') {
			prev();
		} else if (e.key === 'ArrowRight') {
			next();
		}
	}

	function trapFocus(e: KeyboardEvent) {
		if (!lightboxEl || e.key !== 'Tab') return;
		const focusable = Array.from(
			lightboxEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
			)
		);
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

{#if item}
	<div
		bind:this={lightboxEl}
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'page.journal.mediaLightboxLabel')}
		tabindex="-1"
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 focus:outline-none"
		onclick={close}
		onkeydown={(e) => {
			handleKey(e);
			trapFocus(e);
		}}
	>
		<div
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			class="relative max-w-4xl w-full"
		>
			<div class="flex items-center justify-between mb-2">
				{#if items.length > 1}
					<span
						class="text-xs font-medium text-white bg-black/55 px-2.5 py-1 rounded-full select-none"
						>{index + 1} / {items.length}</span
					>
				{:else}
					<span></span>
				{/if}
				<div class="flex items-center gap-1">
					<a
						href={mediaUrl(item)}
						download={item.originalName ?? item.filename}
						class="flex items-center justify-center w-9 h-9 rounded-full bg-black/55 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
						aria-label={t(locale, 'aria.downloadMedia')}
					>
						<Download class="h-5 w-5" />
					</a>
					<button
						type="button"
						onclick={close}
						class="flex items-center justify-center w-9 h-9 rounded-full bg-black/55 text-white hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 transition-colors"
						aria-label={t(locale, 'aria.close')}
					>
						<X class="h-5 w-5" />
					</button>
				</div>
			</div>

			<div class="relative">
				{#if item.mediaType === 'video'}
					<JournalVideo
						src={mediaUrl(item)}
						poster={posterUrl(item)}
						status={item.status}
						downloadName={item.originalName}
						label={item.originalName ?? undefined}
						autoplay
						class="max-h-[78vh] w-full object-contain rounded-lg bg-black"
					/>
				{:else}
					<img
						src={mediaUrl(item)}
						alt={item.originalName ?? ''}
						class="max-h-[78vh] w-full object-contain rounded-lg"
					/>
				{/if}
				{#if items.length > 1}
					<button
						type="button"
						onclick={prev}
						disabled={index === 0}
						class="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white bg-black/55 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 {index ===
						0
							? 'opacity-25 cursor-default'
							: 'hover:bg-black/70'}"
						aria-label={t(locale, 'aria.previousMedia')}
					>
						<ChevronLeft class="h-5 w-5" />
					</button>
					<button
						type="button"
						onclick={next}
						disabled={index === items.length - 1}
						class="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center text-white bg-black/55 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 {index ===
						items.length - 1
							? 'opacity-25 cursor-default'
							: 'hover:bg-black/70'}"
						aria-label={t(locale, 'aria.nextMedia')}
					>
						<ChevronRight class="h-5 w-5" />
					</button>
				{/if}
			</div>

			{#if item.notes}
				<div class="prose prose-sm prose-invert max-w-none mt-3 text-center text-sm text-white/90">
					{@html renderMarkdown(item.notes)}
				</div>
			{/if}
			{#if item.logger}
				<div class="mt-2 flex justify-center">
					<ByLine user={item.logger} variant="inline" class="!text-white/60 !ml-0" />
				</div>
			{/if}
		</div>
	</div>
{/if}
