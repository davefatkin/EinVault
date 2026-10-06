<script lang="ts">
	// Upload, list, caption and delete photos/videos for one journal entry or
	// note. Endpoint details live in the MediaApi adapter; the page supplies the
	// outer wrapper. The DOM hooks below (name="photos", div.group, "Delete
	// media", "Edit Caption", name="photo-notes") are relied on by e2e specs.
	import { ImageIcon, Plus, Trash2 } from '@lucide/svelte';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import JournalVideo from '$lib/components/JournalVideo.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ImmichPicker from '$lib/components/ImmichPicker.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { stripMarkdown } from '$lib/markdown';
	import { MEDIA_ACCEPT, type MediaItem } from '$lib/media';
	import type { MediaApi } from '$lib/mediaApi';
	import { t, getLocale } from '$lib/i18n';

	interface Props {
		/** The media list. Bound so the page sees uploads, deletes and caption edits. */
		items: MediaItem[];
		/** Endpoint adapter (journal or note). */
		api: MediaApi;
		/** Cap on items. The Add and Immich buttons hide at the cap. */
		max: number;
		/** Whether the current user may delete the item or edit its caption. */
		canModify: (item: MediaItem) => boolean;
		immichEnabled: boolean;
		uploadMaxMb: number;
		videoMaxMb: number;
		title: string;
		/** Lightbox state, bindable so a page can open it from a deep link. */
		lightboxOpen?: boolean;
		lightboxIndex?: number;
	}

	let {
		items = $bindable(),
		api,
		max,
		canModify,
		immichEnabled,
		uploadMaxMb,
		videoMaxMb,
		title,
		lightboxOpen = $bindable(false),
		lightboxIndex = $bindable(0)
	}: Props = $props();
	const locale = getLocale();

	let uploading = $state(false);
	let uploadError = $state('');
	let uploadErrorTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => () => clearTimeout(uploadErrorTimer));
	let immichPickerOpen = $state(false);
	let editingId = $state<string | null>(null);
	let editingCaption = $state('');
	let confirmOpen = $state(false);
	let pendingDeleteId = $state<string | null>(null);

	function setUploadError(msg: string) {
		uploadError = msg;
		clearTimeout(uploadErrorTimer);
		uploadErrorTimer = setTimeout(() => (uploadError = ''), 5000);
	}

	function messageOf(err: unknown, fallback: string): string {
		return err instanceof Error && err.message ? err.message : fallback;
	}

	// Skip an item already present (page data may refresh mid-upload), which
	// would otherwise trip the keyed each block.
	function addItem(item: MediaItem) {
		if (items.some((m) => m.id === item.id)) return;
		items = [...items, item];
	}

	async function upload(file: File) {
		if (items.length >= max) {
			setUploadError(api.capMessage(max));
			return;
		}
		uploadError = '';
		clearTimeout(uploadErrorTimer);
		uploading = true;
		try {
			const item = await api.upload(file);
			addItem(item);
		} catch (err) {
			setUploadError(messageOf(err, t(locale, 'media.uploadFailed')));
		} finally {
			uploading = false;
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files?.length) return;
		for (const file of Array.from(files)) {
			if (items.length < max) upload(file);
		}
		input.value = '';
	}

	async function pickFromImmich(assetId: string) {
		try {
			const item = await api.importImmich(assetId);
			addItem(item);
			immichPickerOpen = false;
		} catch (err) {
			setUploadError(messageOf(err, t(locale, 'immich.picker.pickFailed')));
		}
	}

	function askDelete(id: string) {
		pendingDeleteId = id;
		confirmOpen = true;
	}

	async function confirmDelete() {
		confirmOpen = false;
		const id = pendingDeleteId;
		pendingDeleteId = null;
		if (!id) return;
		try {
			await api.remove(id);
			items = items.filter((m) => m.id !== id);
		} catch (err) {
			// Leave the item in place; a reload shows the true state.
			setUploadError(messageOf(err, t(locale, 'media.actionFailed')));
		}
	}

	function startEditCaption(item: MediaItem) {
		editingId = item.id;
		editingCaption = item.caption ?? '';
	}

	async function saveCaption(id: string) {
		try {
			await api.setCaption(id, editingCaption);
		} catch (err) {
			// Keep the editor open so the text isn't lost.
			setUploadError(messageOf(err, t(locale, 'media.actionFailed')));
			return;
		}
		const caption = editingCaption.trim() || null;
		items = items.map((m) => (m.id === id ? { ...m, caption } : m));
		editingId = null;
	}

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	function posterUrl(item: MediaItem): string | null {
		return item.posterKey ? `${api.urlFor(item)}?poster` : null;
	}

	// True while any video is still transcoding. Derived so the poll effect starts
	// once when work appears and stops once when it finishes.
	const hasPendingTranscode = $derived(
		items.some((m) => m.status === 'processing' || m.status === 'claimed')
	);

	// Poll transcode status and swap in the MP4 and poster without a reload
	// (a reload would clobber in-progress text on the journal pages).
	$effect(() => {
		if (!hasPendingTranscode) return;
		let inFlight = false;
		const interval = setInterval(async () => {
			if (inFlight) return; // don't stack requests if one poll is slow
			inFlight = true;
			try {
				const statuses = await api.status();
				const byId = new Map(statuses.map((s) => [s.id, s]));
				let changed = false;
				const next = items.map((m) => {
					const s = byId.get(m.id);
					if (!s || s.status === m.status) return m;
					changed = true;
					return { ...m, status: s.status, filename: s.filename, posterKey: s.posterKey };
				});
				if (changed) items = next;
			} catch {
				// transient; next tick retries
			} finally {
				inFlight = false;
			}
		}, 3000);
		return () => clearInterval(interval);
	});
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between">
		<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
			{title}
			<span class="ml-1 normal-case font-normal text-muted-foreground/70">{items.length}/{max}</span
			>
		</p>
		{#if items.length < max}
			<div class="flex flex-wrap items-center gap-2">
				{#if immichEnabled}
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
						onclick={() => (immichPickerOpen = true)}
					>
						<ImageIcon class="h-3.5 w-3.5" />
						{t(locale, 'immich.picker.button')}
					</button>
				{/if}
				<label
					class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent cursor-pointer"
				>
					{#if uploading}{t(locale, 'media.uploading')}{:else}<Plus class="h-3.5 w-3.5" />
						{t(locale, 'media.add')}{/if}
					<input
						type="file"
						name="photos"
						accept={MEDIA_ACCEPT}
						multiple
						class="sr-only"
						onchange={handleFileInput}
						disabled={uploading}
					/>
				</label>
			</div>
		{/if}
	</div>

	{#if uploadError}
		<div
			role="alert"
			class="rounded-lg bg-coral/10 border border-coral/30 px-4 py-3 text-sm text-coral"
		>
			{uploadError}
		</div>
	{/if}

	{#if items.length === 0}
		<label
			class="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg py-8 cursor-pointer transition-colors hover:opacity-80"
		>
			<ImageIcon class="h-8 w-8 mb-2 text-muted-foreground" />
			<span class="text-sm text-muted-foreground">{t(locale, 'media.drop')}</span>
			<span class="text-xs mt-1 text-muted-foreground"
				>{t(locale, 'media.types', { imgMax: uploadMaxMb, vidMax: videoMaxMb })}</span
			>
			<input
				type="file"
				name="photos"
				accept={MEDIA_ACCEPT}
				multiple
				class="sr-only"
				onchange={handleFileInput}
			/>
		</label>
	{:else}
		<div class="space-y-3">
			{#each items as item, i (item.id)}
				<div class="flex gap-3 items-start">
					<div
						class="group relative shrink-0 {item.mediaType === 'video'
							? 'w-40'
							: 'w-24'} h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800"
					>
						{#if item.mediaType === 'video'}
							<JournalVideo
								src={api.urlFor(item)}
								poster={posterUrl(item)}
								status={item.status}
								downloadName={item.originalName}
								label={item.originalName ?? t(locale, 'media.videoAlt')}
								class="w-full h-full object-cover"
								compact
							/>
						{:else}
							<button
								type="button"
								onclick={() => openLightbox(i)}
								class="block w-full h-full focus:outline-none"
								aria-label={item.originalName ?? t(locale, 'media.photoAlt')}
							>
								<img
									src={api.urlFor(item)}
									alt={item.originalName ?? t(locale, 'media.photoAlt')}
									class="w-full h-full object-cover"
									loading="lazy"
								/>
							</button>
						{/if}
						{#if canModify(item)}
							<button
								type="button"
								onclick={() => askDelete(item.id)}
								class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs
								flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100
								hover:bg-coral transition-all"
								aria-label={t(locale, 'aria.deleteMedia')}
							>
								<Trash2 class="h-3 w-3" />
							</button>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						{#if editingId === item.id}
							<MarkdownTextarea
								value={editingCaption}
								oninput={(e) => (editingCaption = (e.target as HTMLTextAreaElement).value)}
								placeholder={t(locale, 'media.addCaption')}
								rows={3}
								name="photo-notes"
							/>
							<div class="flex gap-2 mt-2">
								<button
									type="button"
									onclick={() => saveCaption(item.id)}
									class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium shadow hover:bg-primary/90 transition-colors"
									>{t(locale, 'common.save')}</button
								>
								<button
									type="button"
									onclick={() => (editingId = null)}
									class="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
									>{t(locale, 'common.cancel')}</button
								>
							</div>
						{:else}
							{#if item.caption}
								<p class="text-sm text-muted-foreground">{stripMarkdown(item.caption)}</p>
							{:else if canModify(item)}
								<p class="text-sm italic text-muted-foreground">
									{t(locale, 'media.noCaption')}
								</p>
							{/if}
							<div class="flex items-center gap-2 mt-1">
								{#if canModify(item)}
									<button
										type="button"
										onclick={() => startEditCaption(item)}
										class="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
										>{t(locale, 'media.editCaption')}</button
									>
								{/if}
								<ByLine user={item.logger} variant="inline" />
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<MediaLightbox {items} urlFor={api.urlFor} bind:open={lightboxOpen} bind:index={lightboxIndex} />

<ConfirmDialog
	open={confirmOpen}
	message={t(locale, 'component.confirmDialog.cantBeUndone')}
	onconfirm={confirmDelete}
	oncancel={() => {
		confirmOpen = false;
		pendingDeleteId = null;
	}}
/>

{#if immichEnabled}
	<ImmichPicker
		open={immichPickerOpen}
		onpick={pickFromImmich}
		onclose={() => (immichPickerOpen = false)}
	/>
{/if}
