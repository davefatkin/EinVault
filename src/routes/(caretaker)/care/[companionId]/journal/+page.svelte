<script lang="ts">
	import type { PageData } from './$types';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import MediaManager from '$lib/components/MediaManager.svelte';
	import { canModifyMedia } from '$lib/permissions';
	import type { MediaItem } from '$lib/media';
	import { journalMediaApi } from '$lib/mediaApi';
	import { NotebookPen, Lock } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { untrack } from 'svelte';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { t, getLocale } from '$lib/i18n';
	import { moodOptions } from '$lib/i18n/labels';
	import { postFormAction } from '$lib/postFormAction';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

	let body = $state(untrack(() => data.todayEntry?.body ?? ''));
	let mood = $state(untrack(() => data.todayEntry?.mood ?? ''));
	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error' | 'signedOut'>('idle');
	let saveTimer: ReturnType<typeof setTimeout>;
	let savedTimer: ReturnType<typeof setTimeout>;

	// Media (upload, caption, delete and transcode poll live in MediaManager)
	let media = $state<MediaItem[]>(untrack(() => data.photos ?? []));
	let mediaApi = $derived(journalMediaApi(data.companion.id, data.today, locale));

	$effect(() => {
		body = data.todayEntry?.body ?? '';
		mood = data.todayEntry?.mood ?? '';
		media = data.photos ?? [];
	});

	const MOODS = moodOptions(locale);

	function triggerSave() {
		clearTimeout(saveTimer);
		clearTimeout(savedTimer);
		saveStatus = 'saving';
		saveTimer = setTimeout(saveNow, 800);
	}

	async function saveNow() {
		const fd = new FormData();
		fd.set('body', body);
		fd.set('mood', mood);
		clearTimeout(savedTimer);
		const outcome = await postFormAction('?/save', fd);
		saveStatus = outcome === 'failed' ? 'error' : outcome;
		// Keep a stale "Saved" fade-out from hiding a later failure.
		if (outcome === 'saved') savedTimer = setTimeout(() => (saveStatus = 'idle'), 2000);
	}

	// The sign-in link opens in a new tab so the draft survives; save again
	// when the user comes back to this one.
	function retryAfterSignIn() {
		if (saveStatus === 'signedOut') {
			saveStatus = 'saving';
			saveNow();
		}
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:window onfocus={retryAfterSignIn} />

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
				{:else if saveStatus === 'signedOut'}<span class="text-coral"
						>{t(locale, 'page.journal.signedOutStatus')}
						<a
							href="/auth/login"
							target="_blank"
							rel="noopener"
							class="underline hover:no-underline">{t(locale, 'page.journal.signInToSave')}</a
						></span
					>
				{/if}
			</span>
			<span class="flex items-center gap-1">
				<ByLine
					user={data.todayEntry?.logger}
					updater={data.todayEntry?.updatedBy &&
					data.todayEntry.updatedBy !== data.todayEntry.loggedBy
						? data.todayEntry.updater
						: null}
					variant="inline"
				/>
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
			<CardContent class="pt-4">
				<MediaManager
					bind:items={media}
					api={mediaApi}
					max={data.maxDailyMedia}
					canModify={(item) => canModifyMedia(data.user, item)}
					immichEnabled={false}
					uploadMaxMb={data.uploadMaxMb}
					videoMaxMb={data.videoMaxMb}
					title={t(locale, 'media.title')}
				/>
			</CardContent>
		</Card>
	{/if}
</div>
