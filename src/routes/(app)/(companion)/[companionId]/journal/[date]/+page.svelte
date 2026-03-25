<script lang="ts">
	import type { PageData } from './$types';
	import { renderMarkdown } from '$lib/markdown';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { enhance } from '$app/forms';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { localDateISO } from '$lib/date';
	import { getContext } from 'svelte';

	const serverTimezone = getContext<string | undefined>('serverTimezone');
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
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
	import { SvelteDate } from 'svelte/reactivity';
	import { localDatetimes } from '$lib/actions/localDatetimes';

	let { data }: { data: PageData } = $props();

	let photos = $state<typeof data.photos>([]);
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
		photos = [...(data.photos ?? [])];
		saveStatus = 'idle';
	});

	let renderedMarkdown = $derived(renderMarkdown(body || '*Nothing written yet.*'));

	const MOODS = [
		{ value: 'great', label: '🤩', title: 'Great' },
		{ value: 'good', label: '😊', title: 'Good' },
		{ value: 'meh', label: '😐', title: 'Meh' },
		{ value: 'off', label: '😕', title: 'Off' },
		{ value: 'sick', label: '🤒', title: 'Sick' }
	];

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

	async function uploadPhoto(file: File) {
		if (photos.length >= 5) {
			setUploadError('Maximum 5 photos per day');
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
			const { id, filename } = await res.json();
			photos = [
				...photos,
				{
					id,
					filename,
					entryId: data.entry?.id ?? '',
					originalName: file.name,
					mimeType: file.type,
					sizeBytes: file.size,
					notes: null,
					createdAt: new Date()
				}
			];
		} catch {
			setUploadError('Upload failed. Please try again.');
		} finally {
			uploading = false;
		}
	}

	async function deletePhoto(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.date}/photos?photoId=${photoId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) photos = photos.filter((p) => p.id !== photoId);
	}

	let editingPhotoId = $state<string | null>(null);
	let editingPhotoNotes = $state('');

	function startEditPhotoNotes(photo: (typeof photos)[0]) {
		editingPhotoId = photo.id;
		editingPhotoNotes = photo.notes ?? '';
	}

	async function savePhotoNotes(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.date}/photos?photoId=${photoId}`,
			{
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ notes: editingPhotoNotes })
			}
		);
		if (res.ok) {
			photos = photos.map((p) =>
				p.id === photoId ? { ...p, notes: editingPhotoNotes.trim() || null } : p
			);
			editingPhotoId = null;
		}
	}

	function handleFileInput(e: Event) {
		const files = (e.target as HTMLInputElement).files;
		if (!files?.length) return;
		for (const file of Array.from(files)) {
			if (photos.length < 5) uploadPhoto(file);
		}
		if (fileInputEl) fileInputEl.value = '';
	}

	function photoUrl(photo: (typeof photos)[0]) {
		return `/api/photos/journal/${companion.id}/${data.date}/${photo.filename}`;
	}

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

	// ── Activity log ────────────────────────────────────────────────────────────
	const EVENT_TYPES = [
		{ value: 'walk', label: '🦮 Walk', hasDuration: true },
		{ value: 'meal', label: '🍖 Meal', hasDuration: false },
		{ value: 'bathroom', label: '💩 Bathroom', hasDuration: false },
		{ value: 'treat', label: '🦴 Treat', hasDuration: false },
		{ value: 'play', label: '🎾 Play', hasDuration: true },
		{ value: 'grooming', label: '🛁 Grooming', hasDuration: true },
		{ value: 'other', label: '📝 Other', hasDuration: false }
	];

	const EVENT_ICONS: Record<string, string> = {
		walk: '🦮',
		meal: '🍖',
		bathroom: '💩',
		treat: '🦴',
		play: '🎾',
		grooming: '🛁',
		other: '📝'
	};

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
	<title>Journal | {companion.name} | EinVault</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<!-- Activity detail modal -->
{#if detailEvent}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label="Close dialog"
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
					aria-label="Close"
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Type</span>
					<Badge variant="secondary" class="capitalize">{detailEvent.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Logged</span>
					<span class="text-foreground"
						><LocalTime date={detailEvent.loggedAt} format="datetime" /></span
					>
				</div>
				{#if detailEvent.durationMinutes}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Duration</span>
						<span class="text-foreground">{detailEvent.durationMinutes} min</span>
					</div>
				{/if}
				{#if detailEvent.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">Notes</p>
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
					<Pencil class="h-3.5 w-3.5" /> Edit
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
				<span class="text-xs font-medium px-2 py-1 text-primary">Today</span>
			{:else}
				<a
					href="/{companion.id}/journal/{data.today}"
					class="inline-flex items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
					>Today <ChevronRight class="h-3.5 w-3.5" /></a
				>
			{/if}
		</div>
		<div class="flex items-center gap-2 text-sm">
			{#if saveStatus === 'saving'}
				<span class="animate-pulse text-muted-foreground">Saving…</span>
			{:else if saveStatus === 'saved'}
				<span class="text-green-600 dark:text-green-400">✓ Saved</span>
			{:else if saveStatus === 'error'}
				<span class="text-red-500">Save failed</span>
				<button
					type="button"
					onclick={saveNow}
					class="text-xs text-red-500 underline hover:no-underline">Retry</button
				>
			{/if}
		</div>
	</div>

	<!-- Mood -->
	<div class="flex items-center gap-2">
		<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">Mood</span>
		<div role="group" aria-label="How is {companion.name} feeling?" class="flex gap-1">
			{#each MOODS as m (m.value)}
				<button
					type="button"
					onclick={() => {
						mood = mood === m.value ? '' : m.value;
						triggerSave();
					}}
					title={m.title}
					aria-pressed={mood === m.value}
					class="text-xl leading-none p-1.5 rounded-lg transition-all
						{mood === m.value
						? 'bg-bark-100 dark:bg-bark-900 ring-1 ring-bark-300 dark:ring-bark-700'
						: 'opacity-40 hover:opacity-80'}"
				>
					{m.label}
				</button>
			{/each}
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
					Write
				</button>
				<button
					type="button"
					onclick={() => (viewMode = 'preview')}
					class="px-3 py-1 rounded-md text-sm font-medium transition-colors {viewMode === 'preview'
						? 'bg-accent text-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
				>
					Preview
				</button>
			</div>
			<div class="hidden sm:flex items-center gap-3">
				<span class="text-xs text-muted-foreground">⌘P to toggle</span>
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
				placeholder="Write about {companion.name}'s day… Markdown is supported."
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

	<!-- Photos -->
	<div class="rounded-lg border border-border bg-card overflow-hidden">
		<div class="flex items-center justify-between px-5 py-3 border-b border-border">
			<h2 class="font-semibold flex items-center gap-2 text-foreground">
				<Camera class="h-4 w-4" /> Photos
				<span class="text-xs font-normal text-muted-foreground">{photos.length}/5</span>
			</h2>
			{#if photos.length < 5}
				<label
					class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent cursor-pointer"
				>
					{#if uploading}Uploading…{:else}<Plus class="h-3.5 w-3.5" /> Add Photo{/if}
					<input
						bind:this={fileInputEl}
						type="file"
						name="photos"
						accept="image/jpeg,image/png,image/webp,image/gif"
						multiple
						class="sr-only"
						onchange={handleFileInput}
						disabled={uploading}
					/>
				</label>
			{/if}
		</div>

		{#if uploadError}
			<div
				class="mx-4 mb-3 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive"
			>
				{uploadError}
			</div>
		{/if}

		<div class="p-4">
			{#if photos.length === 0}
				<label
					class="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg py-8 cursor-pointer transition-colors hover:opacity-80"
				>
					<ImageIcon class="h-8 w-8 mb-2 text-muted-foreground" />
					<span class="text-sm text-muted-foreground">Drop photos here or click to upload</span>
					<span class="text-xs mt-1 text-muted-foreground">JPEG, PNG, or WebP (max 10MB each)</span>
					<input
						type="file"
						name="photos"
						accept="image/jpeg,image/png,image/webp,image/gif"
						multiple
						class="sr-only"
						onchange={handleFileInput}
					/>
				</label>
			{:else}
				<div class="space-y-3">
					{#each photos as photo (photo.id)}
						<div class="flex gap-3 items-start">
							<div
								class="group relative shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800"
							>
								<img
									src={photoUrl(photo)}
									alt={photo.originalName ?? 'Journal photo'}
									class="w-full h-full object-cover"
									loading="lazy"
								/>
								<button
									type="button"
									onclick={() => openConfirm(() => deletePhoto(photo.id))}
									class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs
										flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100
										hover:bg-red-600 transition-all"
									aria-label="Delete photo"
								>
									<Trash2 class="h-3 w-3" />
								</button>
							</div>
							<div class="flex-1 min-w-0">
								{#if editingPhotoId === photo.id}
									<MarkdownTextarea
										value={editingPhotoNotes}
										oninput={(e) => (editingPhotoNotes = (e.target as HTMLTextAreaElement).value)}
										placeholder="Add a caption…"
										rows={3}
										name="photo-notes"
									/>
									<div class="flex gap-2 mt-2">
										<button
											type="button"
											onclick={() => savePhotoNotes(photo.id)}
											class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium shadow hover:bg-primary/90 transition-colors"
											>Save</button
										>
										<button
											type="button"
											onclick={() => (editingPhotoId = null)}
											class="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
											>Cancel</button
										>
									</div>
								{:else}
									{#if photo.notes}
										<p class="text-sm text-muted-foreground">
											{photo.notes.replace(/[#*_`~>[\]]/g, '').trim()}
										</p>
									{:else}
										<p class="text-sm italic text-muted-foreground">No caption</p>
									{/if}
									<button
										type="button"
										onclick={() => startEditPhotoNotes(photo)}
										class="inline-flex items-center justify-center rounded-md px-2 py-0.5 mt-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
										>Edit Caption</button
									>
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
				<ClipboardList class="h-4 w-4" /> Activities
			</h2>
			<button
				onclick={() => (showActivityForm = !showActivityForm)}
				class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
			>
				{#if showActivityForm}Cancel{:else}<Plus class="h-3.5 w-3.5" /> Log Activity{/if}
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
						}}
					class="space-y-4"
				>
					<div class="space-y-1.5">
						<span class="text-sm font-medium text-foreground">Type</span>
						<div class="flex flex-wrap gap-2">
							{#each EVENT_TYPES as t (t.value)}
								<label class="cursor-pointer">
									<input
										type="radio"
										name="type"
										value={t.value}
										bind:group={selectedType}
										class="sr-only"
									/>
									<span
										class="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-border text-muted-foreground {selectedType ===
										t.value
											? 'bg-primary/10 border-primary/30 text-primary'
											: 'hover:text-foreground'}"
									>
										{t.label}
									</span>
								</label>
							{/each}
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<label for="act-loggedAt" class="text-sm font-medium text-foreground">Time</label>
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
									>Duration (min)</label
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
						<label for="act-notes" class="text-sm font-medium text-foreground">Notes</label>
						<MarkdownTextarea id="act-notes" name="notes" placeholder="Any notes…" rows={3} />
					</div>
					<div class="flex gap-3">
						<button
							type="submit"
							class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
							>Log it</button
						>
						<button
							type="button"
							onclick={() => (showActivityForm = false)}
							class="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
							>Cancel</button
						>
					</div>
				</form>
			</div>
		{/if}

		{#if data.dailyEvents.length === 0 && !showActivityForm}
			<div class="text-center py-8 px-6">
				<p class="text-sm italic text-muted-foreground">No activities logged yet.</p>
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
									<span class="text-sm font-medium text-foreground">Type</span>
									<div class="flex flex-wrap gap-2">
										{#each EVENT_TYPES as t (t.value)}
											<label class="cursor-pointer">
												<input
													type="radio"
													name="type"
													value={t.value}
													bind:group={editActivityType}
													class="sr-only"
												/>
												<span
													class="inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-border text-muted-foreground {editActivityType ===
													t.value
														? 'bg-primary/10 border-primary/30 text-primary'
														: 'hover:text-foreground'}"
												>
													{t.label}
												</span>
											</label>
										{/each}
									</div>
								</div>
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-1.5">
										<label
											for="edit-act-loggedAt-{event.id}"
											class="text-sm font-medium text-foreground">Time</label
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
												class="text-sm font-medium text-foreground">Duration (min)</label
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
										>Notes</label
									>
									<MarkdownTextarea
										id="edit-act-notes-{event.id}"
										name="notes"
										value={event.notes ?? ''}
										placeholder="Any notes…"
										rows={3}
									/>
								</div>
								<div class="flex gap-3">
									<button
										type="submit"
										class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
										>Save</button
									>
									<button
										type="button"
										onclick={() => (editingActivityId = null)}
										class="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
										>Cancel</button
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
											{event.notes.replace(/[#*_`~>[\]]/g, '').trim()}
										</p>
									{/if}
								</div>
								<span class="text-xs shrink-0 text-muted-foreground">
									{new Date(event.loggedAt).toLocaleTimeString(undefined, {
										hour: 'numeric',
										minute: '2-digit',
										...(serverTimezone ? { timeZone: serverTimezone } : {})
									})}
								</span>
							</button>
							<button
								type="button"
								onclick={() => startEditActivity(event)}
								class="inline-flex items-center gap-1.5 justify-center rounded-md h-7 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
								><Pencil class="h-3.5 w-3.5" /><span class="hidden sm:inline">Edit</span></button
							>
							<button
								type="button"
								class="inline-flex items-center gap-1.5 justify-center rounded-md h-7 px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-red-500 dark:hover:text-red-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
								onclick={() => {
									deleteActivityId = event.id;
									openConfirm(() => deleteActivityForm?.requestSubmit());
								}}
							>
								<Trash2 class="h-3.5 w-3.5" /><span class="hidden sm:inline">Delete</span>
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
				<h2 class="text-sm font-medium text-muted-foreground">Recent entries</h2>
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

<ConfirmDialog
	open={confirmOpen}
	message="This can't be undone."
	onconfirm={() => {
		confirmOpen = false;
		confirmAction?.();
	}}
	oncancel={() => (confirmOpen = false)}
/>
