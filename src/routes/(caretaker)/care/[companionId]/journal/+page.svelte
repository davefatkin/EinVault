<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { stripMarkdown } from '$lib/markdown';
	import { canModifyMedia } from '$lib/permissions';
	import { isVideoMime, MEDIA_ACCEPT } from '$lib/media';
	import JournalVideo from '$lib/components/JournalVideo.svelte';
	import { Trash2, ImageIcon, Plus, NotebookPen, Lock } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { untrack } from 'svelte';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { t, getLocale } from '$lib/i18n';
	import { moodOptions } from '$lib/i18n/labels';

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

	let body = $state(untrack(() => data.todayEntry?.body ?? ''));
	let mood = $state(untrack(() => data.todayEntry?.mood ?? ''));
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout>;

	// Media
	let media = $state(untrack(() => data.photos ?? []));
	let uploading = $state(false);
	let uploadError = $state('');
	let uploadErrorTimer: ReturnType<typeof setTimeout>;
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	function setUploadError(msg: string) {
		uploadError = msg;
		clearTimeout(uploadErrorTimer);
		uploadErrorTimer = setTimeout(() => (uploadError = ''), 5000);
	}

	// Media caption editing
	let editingMediaId = $state<string | null>(null);
	let editingMediaNotes = $state('');

	$effect(() => {
		body = data.todayEntry?.body ?? '';
		mood = data.todayEntry?.mood ?? '';
		media = data.photos ?? [];
	});

	const MOODS = moodOptions(locale);

	async function triggerSave() {
		clearTimeout(saveTimer);
		saveStatus = 'saving';
		saveTimer = setTimeout(async () => {
			try {
				const fd = new FormData();
				fd.set('body', body);
				fd.set('mood', mood);
				const res = await fetch('?/save', { method: 'POST', body: fd });
				if (res.ok) {
					saveStatus = 'saved';
					setTimeout(() => (saveStatus = 'idle'), 2000);
				} else {
					saveStatus = 'error';
				}
			} catch {
				saveStatus = 'error';
			}
		}, 800);
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
			const res = await fetch(`/api/companions/${data.companion.id}/journal/${data.today}/photos`, {
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
					entryId: data.todayEntry?.id ?? '',
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
			`/api/companions/${data.companion.id}/journal/${data.today}/photos?photoId=${photoId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) media = media.filter((p) => p.id !== photoId);
	}

	function startEditMediaNotes(item: (typeof media)[0]) {
		editingMediaId = item.id;
		editingMediaNotes = item.notes ?? '';
	}

	async function saveMediaNotes(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.today}/photos?photoId=${photoId}`,
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

	function mediaUrl(item: (typeof media)[0]) {
		return `/api/photos/journal/${data.companion.id}/${data.today}/${item.filename}`;
	}

	function posterUrl(item: (typeof media)[0]) {
		return item.posterKey ? `${mediaUrl(item)}?poster` : null;
	}

	// True while any video is still transcoding. Derived so the poll effect starts
	// once when work appears and stops once when it finishes.
	const hasPendingTranscode = $derived(
		media.some((p) => p.status === 'processing' || p.status === 'claimed')
	);

	// Poll transcoding videos and swap in the MP4 once ready, without a full
	// reload (which would clobber the in-progress journal text). Patches only the
	// transcode-relevant fields of changed rows.
	$effect(() => {
		if (!hasPendingTranscode) return;
		let inFlight = false;
		const interval = setInterval(async () => {
			if (inFlight) return; // don't stack requests if one poll is slow
			inFlight = true;
			try {
				const res = await fetch(
					`/api/companions/${data.companion.id}/journal/${data.today}/photos`
				);
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

	function formatDate(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.journal.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="space-y-5">
	<PageHeader title={t(locale, 'page.journal.title')} subtitle={formatDate(data.today)} tint="gold">
		{#snippet icon()}<NotebookPen class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if !data.isOnShift}
		<Card>
			<CardContent class="py-4">
				<EmptyState tint="muted" title={t(locale, 'page.journal.caretaker.noActiveShift')}>
					{#snippet icon()}<Lock class="h-5 w-5" />{/snippet}
				</EmptyState>
				{#if data.nextShift}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.journal.caretaker.nextShiftStarts')}
						<LocalTime date={data.nextShift.startAt} format="datetime" />.
					</p>
				{:else}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.journal.caretaker.noUpcomingShifts')}
					</p>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<div class="flex items-center justify-end gap-2">
			<span class="text-sm">
				{#if saveStatus === 'saving'}<span class="text-muted-foreground animate-pulse"
						>{t(locale, 'page.journal.caretaker.savingStatus')}</span
					>
				{:else if saveStatus === 'saved'}<span class="text-teal"
						>{t(locale, 'page.journal.caretaker.savedStatus')}</span
					>
				{:else if saveStatus === 'error'}<span class="text-coral"
						>{t(locale, 'page.journal.caretaker.saveFailedStatus')}</span
					>
				{/if}
			</span>
			<span class="flex items-center gap-1">
				<ByLine user={data.todayEntry?.logger} variant="inline" />
				{#if data.todayEntry?.updatedBy && data.todayEntry.updatedBy !== data.todayEntry.loggedBy && data.todayEntry.updater}
					<span class="text-xs text-muted-foreground">
						· {t(locale, 'common.updatedBy', { name: data.todayEntry.updater.displayName })}
					</span>
				{/if}
			</span>
		</div>

		<!-- Mood -->
		<div class="flex items-center gap-2">
			<span class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
				{t(locale, 'page.journal.caretaker.howIsDoing', { name: data.companion.name })}
			</span>
			<div
				class="flex gap-1"
				role="group"
				aria-label={t(locale, 'page.journal.caretaker.moodAriaLabel', {
					name: data.companion.name
				})}
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
						class="text-2xl leading-none p-2 rounded-xl transition-all
						{mood === m.value ? 'bg-primary/10 ring-1 ring-primary/30' : 'opacity-40 hover:opacity-80'}"
					>
						{m.icon}
					</button>
				{/each}
			</div>
		</div>

		<!-- Write area: overflow-visible so the MarkdownTextarea "supported" popover isn't clipped -->
		<Card class="overflow-visible">
			<div class="border-b border-border/60 flex items-center justify-between px-4 py-2.5">
				<span class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
					>{t(locale, 'page.journal.caretaker.todaysNotes')}</span
				>
				<span class="text-xs text-muted-foreground"
					>{t(locale, 'page.journal.caretaker.autoSaves')}</span
				>
			</div>
			<div class="p-4">
				<MarkdownTextarea
					name="body"
					bind:value={body}
					oninput={triggerSave}
					placeholder={t(locale, 'page.journal.caretaker.howIsDoing', {
						name: data.companion.name
					})}
					rows={10}
				/>
			</div>
		</Card>

		<!-- Media -->
		<Card class="overflow-hidden">
			<CardHeader class="pb-3 flex flex-row items-center justify-between">
				<h2 class="font-semibold flex items-center gap-2">
					<span>📷</span>
					{t(locale, 'page.journal.caretaker.media')}
					<span class="text-xs font-normal text-muted-foreground"
						>{media.length}/{data.maxDailyMedia}</span
					>
				</h2>
				{#if media.length < data.maxDailyMedia}
					<label
						class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent cursor-pointer"
					>
						{#if uploading}{t(locale, 'common.loading')}{:else}<Plus class="h-3.5 w-3.5" />
							{t(locale, 'page.journal.caretaker.addMedia')}{/if}
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
				{/if}
			</CardHeader>
			{#if uploadError}
				<div
					role="alert"
					class="mx-4 my-3 rounded-lg bg-coral/10 border border-coral/30 px-4 py-3 text-sm text-coral"
				>
					{uploadError}
				</div>
			{/if}
			<CardContent>
				{#if media.length === 0}
					<label
						class="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-lg py-8 cursor-pointer transition-colors hover:opacity-80"
					>
						<ImageIcon class="h-8 w-8 mb-2 text-muted-foreground" />
						<span class="text-sm text-muted-foreground"
							>{t(locale, 'page.journal.caretaker.dropMedia')}</span
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
										<img
											src={mediaUrl(item)}
											alt={item.originalName ?? t(locale, 'page.journal.photoAlt')}
											class="w-full h-full object-cover"
											loading="lazy"
										/>
									{/if}
									{#if canModifyMedia(data.user, item)}
										<button
											onclick={() => deleteMedia(item.id)}
											aria-label={t(locale, 'aria.deleteMedia')}
											class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs
											flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100
											hover:bg-coral transition-all"
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
											placeholder={t(locale, 'page.journal.caretaker.addCaption')}
											rows={3}
											name="photo-notes"
										/>
										<div class="flex gap-2 mt-2">
											<button
												type="button"
												onclick={() => saveMediaNotes(item.id)}
												class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium shadow hover:bg-primary/90 transition-colors"
											>
												{t(locale, 'common.save')}
											</button>
											<button
												type="button"
												onclick={() => (editingMediaId = null)}
												class="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
											>
												{t(locale, 'common.cancel')}
											</button>
										</div>
									{:else}
										{#if item.notes}
											<p class="text-sm text-muted-foreground">
												{stripMarkdown(item.notes)}
											</p>
										{:else}
											<p class="text-sm italic text-muted-foreground">
												{t(locale, 'page.journal.caretaker.noCaption')}
											</p>
										{/if}
										<div class="flex items-center gap-2 mt-1">
											{#if canModifyMedia(data.user, item)}
												<button
													type="button"
													onclick={() => startEditMediaNotes(item)}
													class="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
												>
													{t(locale, 'page.journal.caretaker.editCaption')}
												</button>
											{/if}
											<ByLine user={item.logger} variant="inline" />
										</div>
									{/if}
								</div>
							</div>
						{/each}
						{#if media.length < data.maxDailyMedia}
							<label
								class="aspect-square w-24 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:opacity-80 transition-colors"
							>
								{#if !uploading}<Plus class="h-5 w-5 text-muted-foreground" />{:else}<span
										class="text-muted-foreground text-xs">{t(locale, 'common.loading')}</span
									>{/if}
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
						{/if}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
