<script lang="ts">
	import type { PageData } from './$types';
	import { renderMarkdown, stripMarkdown } from '$lib/markdown';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import MediaLightbox from '$lib/components/MediaLightbox.svelte';
	import { canModifyMedia } from '$lib/permissions';
	import { isVideoMime, MEDIA_ACCEPT } from '$lib/media';
	import JournalVideo from '$lib/components/JournalVideo.svelte';
	import { localDateISO } from '$lib/date';
	import { getContext } from 'svelte';

	const serverTimezone = getContext<string | undefined>('serverTimezone');
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ImmichPicker from '$lib/components/ImmichPicker.svelte';
	import {
		Trash2,
		ChevronLeft,
		ChevronRight,
		Calendar,
		Camera,
		ImageIcon,
		ClipboardList,
		Plus,
		Pencil,
		NotebookPen,
		X
	} from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { moodOptions, activityTypeOptions, ACTIVITY_ICONS } from '$lib/i18n/labels';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

	// Shape of the transcode status poll response (GET .../photos).
	type VideoStatus = {
		id: string;
		status: 'ready' | 'processing' | 'claimed' | 'failed';
		filename: string;
		mimeType: string;
		posterKey: string | null;
	};

	let media = $state<typeof data.photos>([]);
	let companion = $derived(data.companion);

	let body = $state('');
	let mood = $state('');
	let viewMode = $state<'write' | 'preview'>('write');
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout>;

	// bind:this targets must be $state in Svelte 5
	let textareaEl = $state<HTMLTextAreaElement | undefined>(undefined);
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);
	let datePickerEl = $state<HTMLInputElement | undefined>(undefined);

	let uploading = $state(false);
	let uploadError = $state('');
	let uploadErrorTimer: ReturnType<typeof setTimeout>;

	function setUploadError(msg: string) {
		uploadError = msg;
		clearTimeout(uploadErrorTimer);
		uploadErrorTimer = setTimeout(() => (uploadError = ''), 5000);
	}

	// Sync local state when data changes (navigation between dates)
	$effect(() => {
		body = data.entry?.body ?? '';
		mood = data.entry?.mood ?? '';
		media = [...(data.photos ?? [])];
		saveStatus = 'idle';
	});

	let renderedMarkdown = $derived(renderMarkdown(body || '*Nothing written yet.*'));

	const MOODS = moodOptions(locale);

	function prevDate(d: string) {
		const dt = new SvelteDate(d + 'T00:00:00');
		dt.setDate(dt.getDate() - 1);
		return localDateISO(dt);
	}
	function nextDate(d: string) {
		const dt = new SvelteDate(d + 'T00:00:00');
		dt.setDate(dt.getDate() + 1);
		return localDateISO(dt);
	}
	function formatDisplayDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}

	let isNextDisabled = $derived(data.date >= data.today);

	async function saveNow() {
		saveStatus = 'saving';
		try {
			const fd = new FormData();
			fd.set('body', body);
			fd.set('mood', mood);
			const res = await fetch('?/save', { method: 'POST', body: fd });
			saveStatus = res.ok ? 'saved' : 'error';
			if (res.ok) setTimeout(() => (saveStatus = 'idle'), 2000);
		} catch {
			saveStatus = 'error';
		}
	}

	function triggerSave() {
		clearTimeout(saveTimer);
		saveStatus = 'saving';
		saveTimer = setTimeout(saveNow, 800);
	}

	async function uploadMedia(file: File) {
		if (media.length >= data.maxDailyMedia) {
			setUploadError(t(locale, 'error.maxMediaExceeded', { max: data.maxDailyMedia }));
			return;
		}
		uploadError = '';
		clearTimeout(uploadErrorTimer);
		uploading = true;
		try {
			const fd = new FormData();
			fd.set('photo', file);
			const res = await fetch(`/api/companions/${data.companion.id}/journal/${data.date}/photos`, {
				method: 'POST',
				body: fd
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({ message: 'Upload failed' }));
				setUploadError(err.message ?? 'Upload failed');
				return;
			}
			const { id, filename, provider, storageKey, status, posterKey, mimeType, loggedBy, logger } =
				await res.json();
			media = [
				...media,
				{
					id,
					filename,
					provider,
					storageKey,
					entryId: data.entry?.id ?? '',
					originalName: file.name,
					mediaType: isVideoMime(file.type) ? 'video' : 'photo',
					mimeType: mimeType ?? file.type,
					sizeBytes: file.size,
					notes: null,
					status: status ?? 'ready',
					originalKey: null,
					posterKey: posterKey ?? null,
					transcodeAttempts: 0,
					createdAt: new Date(),
					loggedBy,
					logger
				}
			];
		} catch {
			setUploadError('Upload failed. Please try again.');
		} finally {
			uploading = false;
		}
	}

	async function deleteMedia(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.date}/photos?photoId=${photoId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) media = media.filter((p) => p.id !== photoId);
	}

	let editingMediaId = $state<string | null>(null);
	let editingMediaNotes = $state('');

	function startEditMediaNotes(item: (typeof media)[0]) {
		editingMediaId = item.id;
		editingMediaNotes = item.notes ?? '';
	}

	async function saveMediaNotes(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.date}/photos?photoId=${photoId}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: editingMediaNotes })
			}
		);
		if (res.ok) {
			media = media.map((p) =>
				p.id === photoId ? { ...p, notes: editingMediaNotes.trim() || null } : p
			);
			editingMediaId = null;
		}
	}

	function handleFileInput(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files?.length) return;
		for (const file of Array.from(files)) {
			if (media.length < data.maxDailyMedia) uploadMedia(file);
		}
		if (fileInputEl) fileInputEl.value = '';
	}

	let immichPickerOpen = $state(false);

	// Lightbox state
	let lightboxOpen = $state(false);
	let lightboxIndex = $state(0);

	function openLightbox(index: number) {
		lightboxIndex = index;
		lightboxOpen = true;
	}

	// Deep-link: ?media={id} opens the lightbox at that item. Re-fires for a
	// different id/date (the page component is reused across date navigations),
	// idempotent for the same one. Wait until `media` has loaded (a sibling
	// effect fills it from data.photos) so we don't strip the param before the
	// item can resolve, then resolve + strip exactly once per id.
	let lastDeepLinkId = '';
	$effect(() => {
		const mediaId = page.url.searchParams.get('media');
		if (!mediaId || mediaId === lastDeepLinkId) return;
		if (media.length === 0) return;
		lastDeepLinkId = mediaId;
		const idx = media.findIndex((m) => m.id === mediaId);
		if (idx !== -1) {
			lightboxIndex = idx;
			lightboxOpen = true;
		}
		tick().then(() => {
			const url = new URL(page.url);
			url.searchParams.delete('media');
			history.replaceState(history.state, '', url.pathname + url.search);
		});
	});

	async function pickFromImmich(assetId: string) {
		try {
			const res = await fetch(
				`/api/companions/${data.companion.id}/journal/${data.date}/photos/from-immich`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ assetId })
				}
			);
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ message: t(locale, 'immich.picker.pickFailed') }));
				setUploadError(err.message ?? t(locale, 'immich.picker.pickFailed'));
				return;
			}
			const item = await res.json();
			media = [...media, item];
			immichPickerOpen = false;
		} catch {
			setUploadError(t(locale, 'immich.picker.pickFailed'));
		}
	}

	function mediaUrl(item: (typeof media)[0]) {
		return `/api/photos/journal/${companion.id}/${data.date}/${item.filename}`;
	}

	function posterUrl(item: (typeof media)[0]) {
		return item.posterKey ? `${mediaUrl(item)}?poster` : null;
	}

	// True while any video is still transcoding. Derived so the poll effect starts
	// once when work appears and stops once when it finishes — not on every edit to
	// the media array.
	const hasPendingTranscode = $derived(
		media.some((p) => p.status === 'processing' || p.status === 'claimed')
	);

	// Poll the transcode status and swap in the MP4 (filename/mimeType/poster
	// change) without a full reload — invalidateAll would clobber the in-progress
	// journal text. Patches only the transcode-relevant fields of changed rows.
	$effect(() => {
		if (!hasPendingTranscode) return;
		let inFlight = false;
		const interval = setInterval(async () => {
			if (inFlight) return; // don't stack requests if one poll is slow
			inFlight = true;
			try {
				const res = await fetch(`/api/companions/${companion.id}/journal/${data.date}/photos`);
				if (!res.ok) return;
				const { photos: statuses }: { photos: VideoStatus[] } = await res.json();
				const byId = new Map(statuses.map((s) => [s.id, s]));
				let changed = false;
				const next = media.map((p) => {
					const s = byId.get(p.id);
					if (!s || s.status === p.status) return p;
					changed = true;
					return {
						...p,
						status: s.status,
						filename: s.filename,
						mimeType: s.mimeType,
						posterKey: s.posterKey
					};
				});
				if (changed) media = next;
			} catch {
				// transient; next tick retries
			} finally {
				inFlight = false;
			}
		}, 3000);
		return () => clearInterval(interval);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && detailEvent) {
			closeActivityDetail();
			return;
		}
		if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
			e.preventDefault();
			viewMode = viewMode === 'write' ? 'preview' : 'write';
		}
	}

	// Activity log
	const EVENT_TYPES = activityTypeOptions(locale);
	const EVENT_ICONS = ACTIVITY_ICONS;

	function localDatetimeISO(d = new Date()) {
		const p = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
	}

	// Default loggedAt to noon on the viewed date (sensible for past dates)
	function defaultLoggedAt() {
		const d = new Date(data.date + 'T12:00:00');
		return localDatetimeISO(data.isToday ? new Date() : d);
	}

	let showActivityForm = $state(false);
	let selectedType = $state('walk');
	let hasDuration = $derived(
		EVENT_TYPES.find((t) => t.value === selectedType)?.hasDuration ?? false
	);
	let siblingCompanions = $derived(
		data.companions.filter((c) => c.id !== data.companion.id && c.isActive)
	);
	let selectedAdditionalIds = $state<string[]>([]);

	let editingActivityId = $state<string | null>(null);
	let editActivityType = $state('walk');
	let editActivityHasDuration = $derived(
		EVENT_TYPES.find((t) => t.value === editActivityType)?.hasDuration ?? false
	);

	function startEditActivity(event: (typeof data.dailyEvents)[0]) {
		editingActivityId = event.id;
		editActivityType = event.type;
	}

	let confirmOpen = $state(false);
	let confirmAction = $state<(() => void) | null>(null);
	function openConfirm(action: () => void) {
		confirmAction = action;
		confirmOpen = true;
	}

	let deleteActivityId = $state('');
	let deleteActivityForm = $state<HTMLFormElement | null>(null);

	// Activity detail modal
	let detailEvent = $state<(typeof data.dailyEvents)[0] | null>(null);
	let detailDialogEl = $state<HTMLElement | null>(null);

	async function openActivityDetail(event: (typeof data.dailyEvents)[0]) {
		detailEvent = event;
		await tick();
		detailDialogEl?.focus();
	}

	function closeActivityDetail() {
		detailEvent = null;
	}

	function trapDetailFocus(e: KeyboardEvent) {
		if (!detailDialogEl) return;
		const focusable = Array.from(
			detailDialogEl.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => !el.hasAttribute('disabled'));
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.key === 'Tab') {
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
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.journal.title')} | {companion.name} | EinVault</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- Activity detail modal -->
{#if detailEvent}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'aria.closeDialog')}
			onclick={closeActivityDetail}
		></button>
		<div
			bind:this={detailDialogEl}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={trapDetailFocus}
			class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
				animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
		>
			<div class="flex items-center justify-between px-5 pt-5 pb-3">
				<h2 class="font-semibold text-base text-foreground">
					{EVENT_ICONS[detailEvent.type] ?? '📝'}
					{detailEvent.type.charAt(0).toUpperCase() + detailEvent.type.slice(1)}
				</h2>
				<button
					onclick={closeActivityDetail}
					aria-label={t(locale, 'aria.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.journal.day.detailType')}</span
					>
					<Badge variant="secondary" class="capitalize">{detailEvent.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.journal.day.detailLogged')}</span
					>
					<span class="text-foreground"
						><LocalTime date={detailEvent.loggedAt} format="datetime" /><ByLine
							user={detailEvent.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if detailEvent.durationMinutes}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.journal.day.detailDuration')}</span
						>
						<span class="text-foreground">{detailEvent.durationMinutes} min</span>
					</div>
				{/if}
				{#if detailEvent.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.journal.day.detailNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(detailEvent.notes)}
						</div>
					</div>
				{/if}
			</div>

			<Separator />

			<div class="flex gap-2 px-5 py-4">
				<button
					type="button"
					onclick={() => {
						closeActivityDetail();
						startEditActivity(detailEvent!);
					}}
					class="inline-flex items-center gap-1.5 justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
				>
					<Pencil class="h-3.5 w-3.5" />
					{t(locale, 'common.edit')}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-4 pb-24 md:pb-0">
	<!-- Date nav -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<a
				href="/{companion.id}/journal/{prevDate(data.date)}"
				class="inline-flex items-center justify-center rounded-md h-8 w-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
				><ChevronLeft class="h-4 w-4" /></a
			>
			<div>
				<h1 class="font-display font-semibold text-foreground">{formatDisplayDate(data.date)}</h1>
			</div>
			<a
				href="/{companion.id}/journal/{nextDate(data.date)}"
				class="inline-flex items-center justify-center rounded-md h-8 w-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {isNextDisabled
					? 'opacity-30 pointer-events-none'
					: ''}"><ChevronRight class="h-4 w-4" /></a
			>
			<!-- Calendar picker -->
			<div class="relative">
				<button
					type="button"
					onclick={() => datePickerEl?.showPicker()}
					class="inline-flex items-center justify-center rounded-md h-8 w-8 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					title="Go to date"><Calendar class="h-4 w-4" /></button
				>
				<input
					bind:this={datePickerEl}
					id="datePicker"
					type="date"
					value={data.date}
					max={data.today}
					onchange={(e) => {
						const v = (e.target as HTMLInputElement).value;
						if (v) goto(`/${companion.id}/journal/${v}`);
					}}
					class="sr-only"
				/>
			</div>
			{#if data.isToday}
				<span class="text-xs font-medium px-2 py-1 text-primary"
					>{t(locale, 'page.journal.today')}</span
				>
			{:else}
				<a
					href="/{companion.id}/journal/{data.today}"
					class="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
					>{t(locale, 'page.journal.today')} <ChevronRight class="h-3.5 w-3.5" /></a
				>
			{/if}
		</div>
		<span class="hidden items-center gap-1 sm:flex">
			<ByLine user={data.entry?.logger} variant="inline" class="ml-0" />
			{#if data.entry?.updatedBy && data.entry.updatedBy !== data.entry.loggedBy && data.entry.updater}
				<span class="text-xs text-muted-foreground">
					· {t(locale, 'common.updatedBy', { name: data.entry.updater.displayName })}
				</span>
			{/if}
		</span>
	</div>
	<div class="flex items-center gap-1 sm:hidden">
		<ByLine user={data.entry?.logger} variant="inline" class="ml-0" />
		{#if data.entry?.updatedBy && data.entry.updatedBy !== data.entry.loggedBy && data.entry.updater}
			<span class="text-xs text-muted-foreground">
				· {t(locale, 'common.updatedBy', { name: data.entry.updater.displayName })}
			</span>
		{/if}
	</div>

	<!-- Mood -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>{t(locale, 'page.journal.day.mood')}</span
			>
			<div
				role="group"
				aria-label={t(locale, 'page.journal.day.moodQuestion', { name: companion.name })}
				class="flex gap-1"
			>
				{#each MOODS as m (m.value)}
					<button
						type="button"
						onclick={() => {
							mood = mood === m.value ? '' : m.value;
							triggerSave();
						}}
						title={m.label}
						aria-pressed={mood === m.value}
						class="text-xl leading-none p-1.5 rounded-lg transition-all
						{mood === m.value
							? 'bg-bark-100 dark:bg-bark-900 ring-1 ring-bark-300 dark:ring-bark-700'
							: 'opacity-40 hover:opacity-80'}"
					>
						{m.icon}
					</button>
				{/each}
			</div>
		</div>
		<!-- Save status -->
		<div class="flex items-center gap-2 text-sm shrink-0">
			{#if saveStatus === 'saving'}
				<span class="animate-pulse text-muted-foreground"
					>{t(locale, 'page.journal.day.savingStatus')}</span
				>
			{:else if saveStatus === 'saved'}
				<span class="text-green-600 dark:text-green-400"
					>{t(locale, 'page.journal.day.savedStatus')}</span
				>
			{:else if saveStatus === 'error'}
				<span class="text-red-500">{t(locale, 'page.journal.day.saveFailedStatus')}</span>
				<button
					type="button"
					onclick={saveNow}
					class="text-xs text-red-500 underline hover:no-underline"
					>{t(locale, 'page.journal.day.saveFailedRetry')}</button
				>
			{/if}
		</div>
	</div>

	<!-- Editor -->
	<div class="rounded-lg border border-border bg-card overflow-hidden">
		<div class="flex items-center justify-between px-4 py-2 border-b border-border">
			<div class="flex gap-0.5">
				<button
					type="button"
					onclick={() => {
						viewMode = 'write';
						tick().then(() => textareaEl?.focus());
					}}
					class="px-3 py-1 rounded-md text-sm font-medium transition-colors {viewMode === 'write'
						? 'bg-accent text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{t(locale, 'page.journal.day.write')}
				</button>
				<button
					type="button"
					onclick={() => (viewMode = 'preview')}
					class="px-3 py-1 rounded-md text-sm font-medium transition-colors {viewMode === 'preview'
						? 'bg-accent text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					{t(locale, 'page.journal.day.preview')}
				</button>
			</div>
			<div class="hidden sm:flex items-center gap-3">
				<span class="text-xs text-muted-foreground">{t(locale, 'page.journal.day.toggleHint')}</span
				>
				<details class="group">
					<summary
						class="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
							class="h-3 w-3 transition-transform group-open:rotate-90"
							aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg
						>
						Markdown supported
					</summary>
					<div class="mt-2 rounded-md bg-muted/60 px-3 py-2.5 text-xs space-y-1.5">
						<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-baseline">
							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap"
								>**bold**</code
							>
							<span><strong>bold</strong></span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap"
								>_italic_</code
							>
							<span><em>italic</em></span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap"
								>## Heading</code
							>
							<span class="font-semibold text-sm">Heading</span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">- item</code>
							<span>bullet list item</span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">1. item</code
							>
							<span>numbered list item</span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap"
								>&gt; note</code
							>
							<span class="border-l-2 border-border pl-2 text-muted-foreground">note</span>

							<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap"
								>[text](url)</code
							>
							<span class="text-primary underline">link text</span>
						</div>
					</div>
				</details>
			</div>
		</div>

		{#if viewMode === 'write'}
			<textarea
				bind:this={textareaEl}
				bind:value={body}
				oninput={triggerSave}
				placeholder={t(locale, 'page.journal.day.writePlaceholder', { name: companion.name })}
				class="w-full min-h-[360px] resize-none p-4 text-sm font-mono leading-relaxed bg-card text-foreground placeholder:text-muted-foreground focus:outline-none"
				spellcheck="true"
			></textarea>
		{:else}
			<div
				class="prose prose-sm dark:prose-invert max-w-none p-4 min-h-[360px] bg-card text-foreground"
			>
				{@html renderedMarkdown}
			</div>
		{/if}
	</div>

	<!-- Media -->
	<div class="rounded-lg border border-border bg-card overflow-hidden">
		<div
			class="flex flex-col gap-3 px-5 py-3 border-b border-border sm:flex-row sm:items-center sm:justify-between"
		>
			<h2 class="font-semibold flex items-center gap-2 text-foreground">
				<Camera class="h-4 w-4" />
				{t(locale, 'page.journal.day.mediaTitle')}
				<span class="text-xs font-normal text-muted-foreground"
					>{media.length}/{data.maxDailyMedia}</span
				>
			</h2>
			{#if media.length < data.maxDailyMedia}
				<div class="flex flex-wrap items-center gap-2">
					{#if data.immichEnabled}
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
						{#if uploading}{t(locale, 'page.journal.day.uploading')}{:else}<Plus
								class="h-3.5 w-3.5"
							/>
							{t(locale, 'page.journal.day.addMedia')}{/if}
						<input
							bind:this={fileInputEl}
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
				class="mx-4 my-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300"
			>
				{uploadError}
			</div>
		{/if}

		<div class="p-4">
			{#if media.length === 0}
				<label
					class="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg py-8 cursor-pointer transition-colors hover:opacity-80"
				>
					<ImageIcon class="h-8 w-8 mb-2 text-muted-foreground" />
					<span class="text-sm text-muted-foreground"
						>{t(locale, 'page.journal.day.dropMedia')}</span
					>
					<span class="text-xs mt-1 text-muted-foreground"
						>{t(locale, 'page.journal.day.mediaTypes', {
							imgMax: data.uploadMaxMb,
							vidMax: data.videoMaxMb
						})}</span
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
					{#each media as item (item.id)}
						<div class="flex gap-3 items-start">
							<div
								class="group relative shrink-0 {item.mediaType === 'video'
									? 'w-40'
									: 'w-24'} h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800"
							>
								{#if item.mediaType === 'video'}
									<JournalVideo
										src={mediaUrl(item)}
										poster={posterUrl(item)}
										status={item.status}
										downloadName={item.originalName}
										label={item.originalName ?? undefined}
										class="w-full h-full object-cover"
										compact
									/>
								{:else}
									<button
										type="button"
										onclick={() => openLightbox(media.indexOf(item))}
										class="block w-full h-full focus:outline-none"
										aria-label={item.originalName ?? t(locale, 'page.journal.photoAlt')}
									>
										<img
											src={mediaUrl(item)}
											alt={item.originalName ?? t(locale, 'page.journal.photoAlt')}
											class="w-full h-full object-cover"
											loading="lazy"
										/>
									</button>
								{/if}
								{#if canModifyMedia(data.user, item)}
									<button
										type="button"
										onclick={() => openConfirm(() => deleteMedia(item.id))}
										class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs
										flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100
										hover:bg-red-600 transition-all"
										aria-label={t(locale, 'aria.deleteMedia')}
									>
										<Trash2 class="h-3 w-3" />
									</button>
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								{#if editingMediaId === item.id}
									<MarkdownTextarea
										value={editingMediaNotes}
										oninput={(e) => (editingMediaNotes = (e.target as HTMLTextAreaElement).value)}
										placeholder={t(locale, 'page.journal.day.addCaption')}
										rows={3}
										name="photo-notes"
									/>
									<div class="flex gap-2 mt-2">
										<button
											type="button"
											onclick={() => saveMediaNotes(item.id)}
											class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium shadow hover:bg-primary/90 transition-colors"
											>{t(locale, 'common.save')}</button
										>
										<button
											type="button"
											onclick={() => (editingMediaId = null)}
											class="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
											>{t(locale, 'common.cancel')}</button
										>
									</div>
								{:else}
									{#if item.notes}
										<p class="text-sm text-muted-foreground">
											{stripMarkdown(item.notes)}
										</p>
									{:else}
										<p class="text-sm italic text-muted-foreground">
											{t(locale, 'page.journal.day.noCaption')}
										</p>
									{/if}
									<div class="flex items-center gap-2 mt-1">
										{#if canModifyMedia(data.user, item)}
											<button
												type="button"
												onclick={() => startEditMediaNotes(item)}
												class="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
												>{t(locale, 'page.journal.day.editCaption')}</button
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
	</div>

	<!-- Activity log -->
	<div class="rounded-lg border border-border bg-card overflow-hidden">
		<div class="flex items-center justify-between px-5 py-3 border-b border-border">
			<h2 class="font-semibold flex items-center gap-2 text-foreground">
				<ClipboardList class="h-4 w-4" />
				{t(locale, 'page.journal.day.activitiesTitle')}
			</h2>
			<button
				onclick={() => (showActivityForm = !showActivityForm)}
				class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
			>
				{#if showActivityForm}{t(locale, 'common.cancel')}{:else}<Plus class="h-3.5 w-3.5" />
					{t(locale, 'page.journal.day.logActivity')}{/if}
			</button>
		</div>

		{#if showActivityForm}
			<div class="px-6 py-4 border-b border-border animate-slide-up">
				<form
					method="POST"
					action="?/addActivity"
					use:localDatetimes
					use:enhance={() =>
						({ update }) => {
							update();
							showActivityForm = false;
							selectedType = 'walk';
							selectedAdditionalIds = [];
						}}
					class="space-y-4"
				>
					<div class="space-y-1.5">
						<span class="text-sm font-medium text-foreground"
							>{t(locale, 'page.journal.day.activityType')}</span
						>
						<div class="flex flex-wrap gap-2">
							{#each EVENT_TYPES as evtType (evtType.value)}
								<label class="cursor-pointer">
									<input
										type="radio"
										name="type"
										value={evtType.value}
										bind:group={selectedType}
										class="sr-only"
									/>
									<span
										class="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-border text-muted-foreground {selectedType ===
										evtType.value
											? 'bg-primary/10 border-primary/30 text-primary'
											: 'hover:text-foreground'}"
									>
										{evtType.icon}
										{evtType.label}
									</span>
								</label>
							{/each}
						</div>
					</div>
					{#if siblingCompanions.length > 0}
						<fieldset class="space-y-1.5">
							<legend class="text-sm font-medium text-foreground">
								{t(locale, 'page.journal.day.alsoLogFor')}
							</legend>
							<p class="text-xs text-muted-foreground">
								{t(locale, 'page.journal.day.alsoLogForHint')}
							</p>
							<div class="flex flex-wrap gap-2">
								{#each siblingCompanions as sibling (sibling.id)}
									{@const checked = selectedAdditionalIds.includes(sibling.id)}
									<label class="cursor-pointer">
										<input
											type="checkbox"
											name="additionalCompanionIds"
											value={sibling.id}
											bind:group={selectedAdditionalIds}
											class="sr-only"
										/>
										<span
											class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer {checked
												? 'bg-primary/10 border-primary/30 text-primary'
												: 'border-border text-muted-foreground hover:text-foreground'}"
										>
											{sibling.name}
										</span>
									</label>
								{/each}
							</div>
						</fieldset>
					{/if}
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<label for="act-loggedAt" class="text-sm font-medium text-foreground"
								>{t(locale, 'page.journal.day.activityTime')}</label
							>
							<input
								id="act-loggedAt"
								name="loggedAt"
								type="datetime-local"
								autocomplete="off"
								class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
								value={defaultLoggedAt()}
							/>
						</div>
						{#if hasDuration}
							<div class="space-y-1.5">
								<label for="act-duration" class="text-sm font-medium text-foreground"
									>{t(locale, 'page.journal.day.activityDuration')}</label
								>
								<input
									id="act-duration"
									name="durationMinutes"
									type="number"
									min="1"
									autocomplete="off"
									class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
									placeholder="30"
								/>
							</div>
						{/if}
					</div>
					<div class="space-y-1.5">
						<label for="act-notes" class="text-sm font-medium text-foreground"
							>{t(locale, 'page.journal.day.activityNotes')}</label
						>
						<MarkdownTextarea
							id="act-notes"
							name="notes"
							placeholder={t(locale, 'page.journal.day.activityNotes')}
							rows={3}
						/>
					</div>
					<div class="flex gap-3">
						<button
							type="submit"
							class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
							>{t(locale, 'page.journal.day.logIt')}</button
						>
						<button
							type="button"
							onclick={() => (showActivityForm = false)}
							class="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
							>{t(locale, 'common.cancel')}</button
						>
					</div>
				</form>
			</div>
		{/if}

		{#if data.dailyEvents.length === 0 && !showActivityForm}
			<div class="text-center py-8 px-6">
				<p class="text-sm italic text-muted-foreground">
					{t(locale, 'page.journal.day.noActivities')}
				</p>
			</div>
		{:else if data.dailyEvents.length > 0}
			<div class="divide-y divide-border">
				{#each data.dailyEvents as event (event.id)}
					{#if editingActivityId === event.id}
						<div class="px-6 py-4">
							<form
								method="POST"
								action="?/updateActivity"
								use:localDatetimes
								use:enhance={() =>
									({ update }) => {
										update();
										editingActivityId = null;
									}}
								class="space-y-4"
							>
								<input type="hidden" name="id" value={event.id} />
								<div class="space-y-1.5">
									<span class="text-sm font-medium text-foreground"
										>{t(locale, 'page.journal.day.activityType')}</span
									>
									<div class="flex flex-wrap gap-2">
										{#each EVENT_TYPES as evtType (evtType.value)}
											<label class="cursor-pointer">
												<input
													type="radio"
													name="type"
													value={evtType.value}
													bind:group={editActivityType}
													class="sr-only"
												/>
												<span
													class="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-border text-muted-foreground {editActivityType ===
													evtType.value
														? 'bg-primary/10 border-primary/30 text-primary'
														: 'hover:text-foreground'}"
												>
													{evtType.icon}
													{evtType.label}
												</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-1.5">
										<label
											for="edit-act-loggedAt-{event.id}"
											class="text-sm font-medium text-foreground"
											>{t(locale, 'page.journal.day.activityTime')}</label
										>
										<input
											id="edit-act-loggedAt-{event.id}"
											name="loggedAt"
											autocomplete="off"
											type="datetime-local"
											class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
											value={localDatetimeISO(new Date(event.loggedAt))}
										/>
									</div>
									{#if editActivityHasDuration}
										<div class="space-y-1.5">
											<label
												for="edit-act-duration-{event.id}"
												class="text-sm font-medium text-foreground"
												>{t(locale, 'page.journal.day.activityDuration')}</label
											>
											<input
												id="edit-act-duration-{event.id}"
												name="durationMinutes"
												autocomplete="off"
												type="number"
												min="1"
												class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground placeholder:text-muted-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
												value={event.durationMinutes ?? ''}
												placeholder="30"
											/>
										</div>
									{/if}
								</div>
								<div class="space-y-1.5">
									<label for="edit-act-notes-{event.id}" class="text-sm font-medium text-foreground"
										>{t(locale, 'page.journal.day.activityNotes')}</label
									>
									<MarkdownTextarea
										id="edit-act-notes-{event.id}"
										name="notes"
										value={event.notes ?? ''}
										placeholder={t(locale, 'page.journal.day.activityNotes')}
										rows={3}
									/>
								</div>
								<div class="flex gap-3">
									<button
										type="submit"
										class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
										>{t(locale, 'common.save')}</button
									>
									<button
										type="button"
										onclick={() => (editingActivityId = null)}
										class="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
										>{t(locale, 'common.cancel')}</button
									>
								</div>
							</form>
						</div>
					{:else}
						<div class="flex items-center gap-2 pl-6 pr-3 py-3">
							<button
								type="button"
								onclick={() => openActivityDetail(event)}
								class="flex items-center gap-3 flex-1 min-w-0 text-left hover:bg-accent rounded-lg px-2 py-1 transition-colors -mx-2"
							>
								<span class="text-xl shrink-0">{EVENT_ICONS[event.type] ?? '📝'}</span>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<Badge variant="secondary" class="capitalize">{event.type}</Badge>
										{#if event.durationMinutes}
											<span class="text-xs text-muted-foreground">{event.durationMinutes} min</span>
										{/if}
									</div>
									{#if event.notes}
										<p class="text-sm mt-0.5 text-muted-foreground">
											{stripMarkdown(event.notes)}
										</p>
									{/if}
								</div>
								<div class="text-xs shrink-0 text-muted-foreground text-right">
									<span
										>{new Date(event.loggedAt).toLocaleTimeString(undefined, {
											hour: 'numeric',
											minute: '2-digit',
											...(serverTimezone ? { timeZone: serverTimezone } : {})
										})}</span
									>
									<ByLine user={event.logger} />
								</div>
							</button>
							<button
								type="button"
								onclick={() => startEditActivity(event)}
								class="inline-flex items-center gap-1.5 justify-center rounded-md h-7 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
								><Pencil class="h-3.5 w-3.5" /><span class="hidden sm:inline"
									>{t(locale, 'common.edit')}</span
								></button
							>
							<button
								type="button"
								class="inline-flex items-center gap-1.5 justify-center rounded-md h-7 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-red-500 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
								onclick={() => {
									deleteActivityId = event.id;
									openConfirm(() => deleteActivityForm?.requestSubmit());
								}}
							>
								<Trash2 class="h-3.5 w-3.5" /><span class="hidden sm:inline"
									>{t(locale, 'common.delete')}</span
								>
							</button>
						</div>
					{/if}
				{/each}
			</div>
		{/if}
	</div>

	<!-- Recent entries strip -->
	{#if data.recentEntries.length > 0}
		<div class="rounded-lg border border-border bg-card">
			<div class="px-5 py-3 border-b border-border">
				<h2 class="text-sm font-medium text-muted-foreground">
					{t(locale, 'page.journal.day.recentEntries')}
				</h2>
			</div>
			<div class="p-4">
				<div class="flex flex-wrap gap-2">
					{#each data.recentEntries as e (e.date)}
						{@const entryMood = e.date === data.date ? mood : (e.mood ?? '')}
						<a
							href="/{companion.id}/journal/{e.date}"
							class="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border transition-colors {e.date ===
							data.date
								? 'bg-primary/10 border-primary/30 text-primary'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{#if entryMood === 'great'}🤩{:else if entryMood === 'good'}😊{:else if entryMood === 'meh'}😐{:else if entryMood === 'off'}😕{:else if entryMood === 'sick'}🤒{:else}<NotebookPen
									class="h-3.5 w-3.5"
								/>{/if}
							{e.date}
						</a>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<form
	bind:this={deleteActivityForm}
	method="POST"
	action="?/deleteActivity"
	use:enhance
	class="hidden"
>
	<input type="hidden" name="id" value={deleteActivityId} />
</form>

<MediaLightbox
	companionId={data.companion.id}
	items={media}
	date={data.date}
	bind:open={lightboxOpen}
	bind:index={lightboxIndex}
/>

<ConfirmDialog
	open={confirmOpen}
	message={t(locale, 'component.confirmDialog.cantBeUndone')}
	onconfirm={() => {
		confirmOpen = false;
		confirmAction?.();
	}}
	oncancel={() => (confirmOpen = false)}
/>

{#if data.immichEnabled}
	<ImmichPicker
		open={immichPickerOpen}
		onpick={pickFromImmich}
		onclose={() => (immichPickerOpen = false)}
	/>
{/if}
