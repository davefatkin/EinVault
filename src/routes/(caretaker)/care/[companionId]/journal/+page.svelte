<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { untrack } from 'svelte';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { t, getLocale } from '$lib/i18n';
	import { moodOptions } from '$lib/i18n/labels';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

	let body = $state(untrack(() => data.todayEntry?.body ?? ''));
	let mood = $state(untrack(() => data.todayEntry?.mood ?? ''));
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout>;

	// Photos
	let photos = $state(untrack(() => data.photos ?? []));
	let uploading = $state(false);
	let uploadError = $state('');
	let uploadErrorTimer: ReturnType<typeof setTimeout>;
	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	function setUploadError(msg: string) {
		uploadError = msg;
		clearTimeout(uploadErrorTimer);
		uploadErrorTimer = setTimeout(() => (uploadError = ''), 5000);
	}

	// Photo caption editing
	let editingPhotoId = $state<string | null>(null);
	let editingPhotoNotes = $state('');

	$effect(() => {
		body = data.todayEntry?.body ?? '';
		mood = data.todayEntry?.mood ?? '';
		photos = data.photos ?? [];
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
			const res = await fetch(`/api/companions/${data.companion.id}/journal/${data.today}/photos`, {
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
					entryId: data.todayEntry?.id ?? '',
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
			`/api/companions/${data.companion.id}/journal/${data.today}/photos?photoId=${photoId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) photos = photos.filter((p) => p.id !== photoId);
	}

	function startEditPhotoNotes(photo: (typeof photos)[0]) {
		editingPhotoId = photo.id;
		editingPhotoNotes = photo.notes ?? '';
	}

	async function savePhotoNotes(photoId: string) {
		const res = await fetch(
			`/api/companions/${data.companion.id}/journal/${data.today}/photos?photoId=${photoId}`,
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
		fileInputEl.value = '';
	}

	function photoUrl(photo: (typeof photos)[0]) {
		return `/api/photos/journal/${data.companion.id}/${data.today}/${photo.filename}`;
	}

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
	{#if !data.isOnShift}
		<div>
			<h1 class="font-display text-2xl font-bold">{t(locale, 'page.journal.title')}</h1>
		</div>
		<Card>
			<CardContent class="text-center py-12">
				<p class="text-4xl mb-3">🔒</p>
				<p class="font-medium mb-1">{t(locale, 'page.journal.caretaker.noActiveShift')}</p>
				{#if data.nextShift}
					<p class="text-sm text-muted-foreground">
						{t(locale, 'page.journal.caretaker.nextShiftStarts')}
						<LocalTime date={data.nextShift.startAt} format="datetime" />.
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						{t(locale, 'page.journal.caretaker.noUpcomingShifts')}
					</p>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<div class="flex items-center justify-between">
			<div>
				<h1 class="font-display text-2xl font-bold">{t(locale, 'page.journal.title')}</h1>
				<p class="text-muted-foreground text-sm mt-0.5">{formatDate(data.today)}</p>
			</div>
			<span class="text-sm">
				{#if saveStatus === 'saving'}<span class="text-muted-foreground animate-pulse"
						>{t(locale, 'page.journal.caretaker.savingStatus')}</span
					>
				{:else if saveStatus === 'saved'}<span class="text-[hsl(var(--moss))]"
						>{t(locale, 'page.journal.caretaker.savedStatus')}</span
					>
				{:else if saveStatus === 'error'}<span class="text-red-500"
						>{t(locale, 'page.journal.caretaker.saveFailedStatus')}</span
					>
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
						{mood === m.value
							? 'bg-moss-100 dark:bg-moss-900 ring-1 ring-moss-300 dark:ring-moss-700'
							: 'opacity-40 hover:opacity-80'}"
					>
						{m.icon}
					</button>
				{/each}
			</div>
		</div>

		<!-- Write area -->
		<Card class="overflow-hidden">
			<div class="border-b border-border/60 flex items-center justify-between px-4 py-2.5">
				<span class="text-sm font-medium text-muted-foreground"
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

		<!-- Photos -->
		<Card class="overflow-hidden">
			<CardHeader class="pb-3 flex flex-row items-center justify-between">
				<h2 class="font-semibold flex items-center gap-2">
					<span>📷</span>
					{t(locale, 'page.journal.caretaker.photos')}
					<span class="text-xs font-normal text-muted-foreground">{photos.length}/5</span>
				</h2>
				{#if photos.length < 5}
					<label
						class="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
					>
						{uploading ? t(locale, 'common.loading') : t(locale, 'page.journal.caretaker.addPhoto')}
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
			</CardHeader>
			{#if uploadError}
				<div
					class="mx-4 mb-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-600 dark:text-red-300"
				>
					{uploadError}
				</div>
			{/if}
			<CardContent>
				{#if photos.length === 0}
					<label
						class="flex flex-col items-center justify-center border-2 border-dashed rounded-lg py-8
					cursor-pointer hover:opacity-80 transition-colors"
					>
						<span class="text-3xl mb-2">🖼️</span>
						<span class="text-sm text-muted-foreground"
							>{t(locale, 'page.journal.caretaker.dropPhotos')}</span
						>
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
										alt={photo.originalName ?? t(locale, 'page.journal.photoAlt')}
										class="w-full h-full object-cover"
										loading="lazy"
									/>
									<button
										onclick={() => deletePhoto(photo.id)}
										aria-label={t(locale, 'aria.deletePhoto')}
										class="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 text-xs
										flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100
										hover:bg-red-600 transition-all"
									>
										<span aria-hidden="true">✕</span>
									</button>
								</div>
								<div class="flex-1 min-w-0">
									{#if editingPhotoId === photo.id}
										<MarkdownTextarea
											value={editingPhotoNotes}
											oninput={(e) => (editingPhotoNotes = (e.target as HTMLTextAreaElement).value)}
											placeholder={t(locale, 'page.journal.caretaker.addCaption')}
											rows={3}
											name="photo-notes"
										/>
										<div class="flex gap-2 mt-2">
											<button
												type="button"
												onclick={() => savePhotoNotes(photo.id)}
												class="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs font-medium shadow hover:bg-primary/90 transition-colors"
											>
												{t(locale, 'common.save')}
											</button>
											<button
												type="button"
												onclick={() => (editingPhotoId = null)}
												class="inline-flex items-center justify-center rounded-md border border-input bg-background px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent transition-colors"
											>
												{t(locale, 'common.cancel')}
											</button>
										</div>
									{:else}
										{#if photo.notes}
											<p class="text-sm text-muted-foreground">
												{photo.notes.replace(/[#*_`~>[\]]/g, '').trim()}
											</p>
										{:else}
											<p class="text-sm italic text-muted-foreground">
												{t(locale, 'page.journal.caretaker.noCaption')}
											</p>
										{/if}
										<button
											type="button"
											onclick={() => startEditPhotoNotes(photo)}
											class="inline-flex items-center justify-center rounded-md px-2 py-0.5 mt-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
										>
											{t(locale, 'page.journal.caretaker.editCaption')}
										</button>
									{/if}
								</div>
							</div>
						{/each}
						{#if photos.length < 5}
							<label
								class="aspect-square w-24 rounded-lg border-2 border-dashed flex flex-col items-center
							justify-center cursor-pointer hover:opacity-80 transition-colors"
							>
								<span class="text-2xl">{uploading ? '⏳' : '+'}</span>
								<input
									type="file"
									name="photos"
									accept="image/jpeg,image/png,image/webp"
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
