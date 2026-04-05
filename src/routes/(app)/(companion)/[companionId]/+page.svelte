<script lang="ts">
	import type { PageData } from './$types';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { localDateISO } from '$lib/date';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import {
		Scale,
		ClipboardList,
		Bell,
		HeartPulse,
		Pencil,
		UserCheck,
		NotebookPen,
		X
	} from '@lucide/svelte';
	import { tick } from 'svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { MOOD_ICONS, ACTIVITY_ICONS } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';

	let { data }: { data: PageData } = $props();
	let {
		companion,
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		todayJournal,
		activeCaretakerShift
	} = $derived(data);

	const locale = getLocale();

	function age(dob: string | null): string {
		if (!dob) return 'Unknown age';
		const birth = new Date(dob);
		const now = new Date();
		const months =
			(now.getFullYear() - birth.getFullYear()) * 12 + now.getMonth() - birth.getMonth();
		if (months < 12) return `${months}mo old`;
		const y = Math.floor(months / 12);
		const m = months % 12;
		return m > 0 ? `${y}y ${m}mo` : `${y}y old`;
	}

	let today = localDateISO();

	const MOOD_LABEL = MOOD_ICONS;
	const ACTIVITY_ICON = ACTIVITY_ICONS;

	// Detail modal
	type SelectedItem =
		| { kind: 'reminder'; item: (typeof upcomingReminders)[0] }
		| { kind: 'weight'; item: (typeof recentWeights)[0] }
		| { kind: 'activity'; item: (typeof recentDaily)[0] }
		| { kind: 'health'; item: (typeof recentHealth)[0] };

	let selected = $state<SelectedItem | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	// Avatar lightbox
	let avatarLightboxOpen = $state(false);
	let avatarUrl = $derived(companion.avatarPath ? `/api/avatars/${companion.id}` : null);

	function closeAvatarLightbox() {
		avatarLightboxOpen = false;
		(document.activeElement as HTMLElement)?.blur();
	}

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (avatarLightboxOpen) {
				closeAvatarLightbox();
				return;
			}
			if (selected) {
				closeDetail();
			}
		}
	}

	async function openDetail(s: SelectedItem) {
		selected = s;
		await tick();
		dialogEl?.focus();
	}

	function closeDetail() {
		selected = null;
	}

	function eventDate(d: Date | string): string {
		return new Date(d).toISOString().slice(0, 10);
	}

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		const focusable = Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
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

<svelte:window onkeydown={handleWindowKey} />

<svelte:head>
	<title>{companion.name} | EinVault</title>
</svelte:head>

<!-- Avatar lightbox -->
{#if avatarLightboxOpen && avatarUrl}
	<div
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'aria.viewPhoto', { name: companion.name })}
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85"
		onclick={closeAvatarLightbox}
		onkeydown={(e) => e.key === 'Escape' && closeAvatarLightbox()}
		tabindex="-1"
	>
		<div
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			class="relative max-w-sm w-full"
		>
			<div class="flex justify-end mb-2">
				<button
					type="button"
					onclick={closeAvatarLightbox}
					class="text-white/70 hover:text-white p-1 rounded"
					aria-label={t(locale, 'page.dashboard.closePhoto')}
				>
					<X class="h-5 w-5" />
				</button>
			</div>
			<img
				src={avatarUrl}
				alt={t(locale, 'component.avatar.alt', { name: companion.name })}
				class="w-full rounded-xl object-contain max-h-[80vh] shadow-2xl"
			/>
		</div>
	</div>
{/if}

<!-- Detail modal -->
{#if selected}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'page.dashboard.closeDialog')}
			onclick={closeDetail}
		></button>
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={trapFocus}
			class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
				animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
		>
			<div class="flex items-center justify-between px-5 pt-5 pb-3">
				<h2 class="font-semibold text-base text-foreground">
					{#if selected.kind === 'reminder'}
						{selected.item.title}
					{:else if selected.kind === 'weight'}
						{t(locale, 'page.dashboard.modalWeightEntry')}
					{:else if selected.kind === 'activity'}
						{ACTIVITY_ICON[selected.item.type] ?? '📝'}
						{selected.item.type.charAt(0).toUpperCase() + selected.item.type.slice(1)}
					{:else if selected.kind === 'health'}
						{selected.item.title}
					{/if}
				</h2>
				<button
					onclick={closeDetail}
					aria-label={t(locale, 'common.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				{#if selected.kind === 'reminder'}
					{@const r = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelType')}</span
						>
						<Badge variant="secondary" class="capitalize">{r.type}</Badge>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelDue')}</span
						>
						<span class="text-foreground"><LocalTime date={r.dueAt} format="datetime" /></span>
					</div>
					{#if r.isRecurring}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.dashboard.modalLabelRepeats')}</span
							>
							<span class="text-foreground"
								>{r.recurringDays !== 1
									? t(locale, 'page.dashboard.modalLabelEveryDaysPlural', {
											count: r.recurringDays ?? 1
										})
									: t(locale, 'page.dashboard.modalLabelEveryDays')}</span
							>
						</div>
					{/if}
					{#if r.description}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.dashboard.modalLabelNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(r.description)}
							</div>
						</div>
					{/if}
				{:else if selected.kind === 'weight'}
					{@const w = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelWeight')}</span
						>
						<span class="text-xl font-bold text-foreground"
							>{w.weight}
							<span class="text-sm font-normal text-muted-foreground">{w.unit}</span></span
						>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelRecorded')}</span
						>
						<span class="text-foreground"><LocalTime date={w.recordedAt} format="datetime" /></span>
					</div>
					{#if w.notes}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.dashboard.modalLabelNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(w.notes)}
							</div>
						</div>
					{/if}
				{:else if selected.kind === 'activity'}
					{@const e = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelType')}</span
						>
						<Badge variant="secondary" class="capitalize">{e.type}</Badge>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelLogged')}</span
						>
						<span class="text-foreground"><LocalTime date={e.loggedAt} format="datetime" /></span>
					</div>
					{#if e.durationMinutes}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.dashboard.modalLabelDuration')}</span
							>
							<span class="text-foreground">{e.durationMinutes} min</span>
						</div>
					{/if}
					{#if e.notes}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.dashboard.modalLabelNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(e.notes)}
							</div>
						</div>
					{/if}
				{:else if selected.kind === 'health'}
					{@const h = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelType')}</span
						>
						<Badge variant="bark" class="capitalize">{h.type.replace('_', ' ')}</Badge>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelDate')}</span
						>
						<span class="text-foreground"><LocalTime date={h.occurredAt} format="datetime" /></span>
					</div>
					{#if h.nextDueAt}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.dashboard.modalLabelNextDue')}</span
							>
							<span class="text-foreground"><LocalTime date={h.nextDueAt} format="datetime" /></span
							>
						</div>
					{/if}
					{#if h.vetName || h.vetClinic}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.dashboard.modalLabelVet')}</span
							>
							<span class="text-foreground"
								>{[h.vetName, h.vetClinic].filter(Boolean).join(', ')}</span
							>
						</div>
					{/if}
					{#if h.notes}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.dashboard.modalLabelNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(h.notes)}
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<Separator />

			{#if companion.isActive !== false}
				<div class="flex gap-2 px-5 py-4">
					{#if selected.kind === 'reminder'}
						<Button
							href="/{companion.id}/reminders?edit={selected.item.id}"
							variant="outline"
							size="sm"
							onclick={closeDetail}
						>
							<Pencil class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'page.dashboard.modalEditReminders')}
						</Button>
					{:else if selected.kind === 'weight' || selected.kind === 'health'}
						<Button
							href="/{companion.id}/health?edit={selected.item.id}"
							variant="outline"
							size="sm"
							onclick={closeDetail}
						>
							<Pencil class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'page.dashboard.modalEditHealth')}
						</Button>
					{:else if selected.kind === 'activity'}
						<Button
							href="/{companion.id}/journal/{eventDate(selected.item.loggedAt)}"
							variant="outline"
							size="sm"
							onclick={closeDetail}
						>
							<NotebookPen class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'page.dashboard.modalOpenJournal')}
						</Button>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="space-y-6 pb-20 md:pb-0">
	{#if !companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.dashboard.archivedBanner', { name: companion.name })}
		</div>
	{/if}

	<!-- Companion hero -->
	<Card class="overflow-hidden">
		<div class="bg-gradient-to-r from-bark-600 to-bark-700 px-6 py-5 text-white">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<CompanionAvatar
						companionId={companion.id}
						avatarPath={companion.avatarPath}
						name={companion.name}
						size="lg"
						editable={companion.isActive}
						onlightbox={avatarUrl ? () => (avatarLightboxOpen = true) : undefined}
					/>
					<div>
						<h1 class="font-display text-2xl font-bold">{companion.name}</h1>
						<p class="text-bark-100 text-sm">
							{companion.breed ?? t(locale, 'page.dashboard.mixedBreed')} · {age(
								companion.dob
							)}{companion.sex ? ` · ${companion.sex}` : ''}
						</p>
					</div>
				</div>
				{#if companion.isActive !== false}
					<Button
						href="/companions/{companion.id}/edit"
						variant="outline"
						size="sm"
						class="border-white/20 text-white bg-white/10 hover:bg-white/20 hover:text-white"
					>
						<Pencil class="h-3.5 w-3.5 mr-1.5" />
						{t(locale, 'common.edit')}
					</Button>
				{/if}
			</div>
		</div>
	</Card>

	<!-- Caretaker on shift -->
	{#if activeCaretakerShift}
		<Card class="border-l-4 border-l-moss-500">
			<CardContent class="pt-4 pb-4">
				<div class="flex items-start justify-between gap-4">
					<div class="flex items-start gap-3">
						<UserCheck class="h-5 w-5 mt-0.5 text-moss-600 dark:text-moss-400 shrink-0" />
						<div>
							<p
								class="text-xs font-semibold uppercase tracking-wide text-moss-600 dark:text-moss-400 mb-0.5"
							>
								{t(locale, 'page.dashboard.caretakerOnShift')}
							</p>
							<p class="font-semibold text-foreground">{activeCaretakerShift.displayName}</p>
							<p class="text-sm text-muted-foreground">
								{t(locale, 'page.dashboard.shiftEnds')}
								<LocalTime date={activeCaretakerShift.endAt} />
							</p>
							{#if activeCaretakerShift.notes}
								<p class="text-sm text-foreground mt-1">{activeCaretakerShift.notes}</p>
							{/if}
						</div>
					</div>
					<div class="flex flex-col items-end gap-1 shrink-0 text-sm">
						{#if activeCaretakerShift.phone}
							<a
								href="tel:{activeCaretakerShift.phone}"
								class="text-primary hover:underline font-medium"
							>
								{activeCaretakerShift.phone}
							</a>
						{/if}
						{#if activeCaretakerShift.email}
							<a
								href="mailto:{activeCaretakerShift.email}"
								class="text-xs text-muted-foreground hover:underline"
							>
								{activeCaretakerShift.email}
							</a>
						{/if}
					</div>
				</div>
			</CardContent>
		</Card>
	{/if}

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
		<!-- Journal card -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<NotebookPen class="h-4 w-4" />
						{t(locale, 'page.dashboard.cardJournal')}
					</CardTitle>
					{#if companion.isActive !== false}
						<Button
							href="/{companion.id}/journal/{today}"
							variant="ghost"
							size="sm"
							class="h-7 text-xs text-primary px-2"
						>
							{todayJournal
								? t(locale, 'page.dashboard.journalEditEntry')
								: t(locale, 'page.dashboard.journalWriteEntry')}
						</Button>
					{/if}
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				{#if todayJournal?.body}
					<p class="text-sm line-clamp-3 text-muted-foreground">
						{todayJournal.body.replace(/[#*_`~>[\]]/g, '').trim()}
					</p>
					{#if todayJournal.mood}
						<p class="mt-2 text-lg">{MOOD_LABEL[todayJournal.mood] ?? ''}</p>
					{/if}
				{:else}
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'page.dashboard.journalEmpty')}
					</p>
				{/if}
			</CardContent>
		</Card>

		<!-- Reminders -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<Bell class="h-4 w-4" />
						{t(locale, 'page.dashboard.cardReminders')}
					</CardTitle>
					<Button
						href="/{companion.id}/reminders"
						variant="ghost"
						size="sm"
						class="h-7 text-xs text-primary px-2"
					>
						{t(locale, 'page.dashboard.remindersViewAll')}
					</Button>
				</div>
			</CardHeader>
			<CardContent class="pt-0 space-y-1">
				{#if upcomingReminders.length === 0}
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'page.dashboard.remindersEmpty')}
					</p>
				{:else}
					{#each upcomingReminders.slice(0, 3) as reminder (reminder.id)}
						<button
							type="button"
							onclick={() => openDetail({ kind: 'reminder', item: reminder })}
							class="w-full flex items-center justify-between text-sm rounded-md px-2 py-1.5 -mx-2
								hover:bg-accent transition-colors text-left"
						>
							<span class="truncate text-foreground">{reminder.title}</span>
							<span class="shrink-0 ml-2 text-xs text-muted-foreground">
								<LocalTime date={reminder.dueAt} />
							</span>
						</button>
					{/each}
				{/if}
			</CardContent>
		</Card>

		<!-- Weight -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<Scale class="h-4 w-4" />
						{t(locale, 'page.dashboard.cardWeight')}
					</CardTitle>
					{#if companion.isActive !== false}
						<Button
							href="/{companion.id}/health"
							variant="ghost"
							size="sm"
							class="h-7 text-xs text-primary px-2"
						>
							{t(locale, 'page.dashboard.weightLog')}
						</Button>
					{/if}
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				{#if recentWeights.length > 0}
					{@const latest = recentWeights[0]}
					<button
						type="button"
						onclick={() => openDetail({ kind: 'weight', item: latest })}
						class="block w-full text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors"
					>
						<p class="text-2xl font-bold text-foreground">
							{latest.weight}<span class="text-sm font-normal ml-1 text-muted-foreground"
								>{latest.unit}</span
							>
						</p>
						<p class="text-xs mt-1 text-muted-foreground">
							{t(locale, 'page.dashboard.weightAsOf')}
							<LocalTime date={latest.recordedAt} />
						</p>
					</button>
					{#if recentWeights.length > 1}
						<div class="mt-3 space-y-1">
							{#each recentWeights.slice(1, 4) as w (w.id)}
								<button
									type="button"
									onclick={() => openDetail({ kind: 'weight', item: w })}
									class="w-full flex items-center justify-between text-sm rounded-md px-2 py-1 -mx-2
										hover:bg-accent transition-colors"
								>
									<span class="text-muted-foreground">{w.weight} {w.unit}</span>
									<span class="text-xs text-muted-foreground"
										><LocalTime date={w.recordedAt} /></span
									>
								</button>
							{/each}
						</div>
					{/if}
				{:else}
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'page.dashboard.weightEmpty')}
					</p>
				{/if}
			</CardContent>
		</Card>
	</div>

	<!-- Recent activity -->
	<Card>
		<CardHeader class="pb-3">
			<div class="flex items-center justify-between">
				<CardTitle class="text-sm font-semibold flex items-center gap-2">
					<ClipboardList class="h-4 w-4" />
					{t(locale, 'page.dashboard.cardActivity')}
				</CardTitle>
				{#if companion.isActive !== false}
					<Button
						href="/{companion.id}/journal/{today}"
						variant="ghost"
						size="sm"
						class="h-7 text-xs text-primary px-2"
					>
						{t(locale, 'page.dashboard.activityLog')}
					</Button>
				{/if}
			</div>
		</CardHeader>
		<CardContent class="pt-0">
			{#if recentDaily.length === 0}
				<p class="text-sm italic text-muted-foreground">
					{t(locale, 'page.dashboard.activityEmpty')}
				</p>
			{:else}
				<div class="space-y-1">
					{#each recentDaily as event (event.id)}
						<button
							type="button"
							onclick={() => openDetail({ kind: 'activity', item: event })}
							class="w-full flex items-center gap-3 text-sm rounded-md px-2 py-1.5 -mx-2
								hover:bg-accent transition-colors text-left"
						>
							<span class="w-24 shrink-0 text-xs text-muted-foreground whitespace-nowrap">
								<LocalTime date={event.loggedAt} format="date" />
							</span>
							<span class="text-base shrink-0">{ACTIVITY_ICON[event.type] ?? '📝'}</span>
							<Badge variant="secondary" class="capitalize">{event.type}</Badge>
							{#if event.notes}
								<span class="truncate text-muted-foreground">
									{event.notes.replace(/[#*_`~>[\]]/g, '').trim()}
								</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Recent health -->
	<Card>
		<CardHeader class="pb-3">
			<div class="flex items-center justify-between">
				<CardTitle class="text-sm font-semibold flex items-center gap-2">
					<HeartPulse class="h-4 w-4" />
					{t(locale, 'page.dashboard.cardHealth')}
				</CardTitle>
				<Button
					href="/{companion.id}/health"
					variant="ghost"
					size="sm"
					class="h-7 text-xs text-primary px-2"
				>
					{t(locale, 'page.dashboard.healthViewAll')}
				</Button>
			</div>
		</CardHeader>
		<CardContent class="pt-0">
			{#if recentHealth.length === 0}
				<p class="text-sm italic text-muted-foreground">
					{t(locale, 'page.dashboard.healthEmpty')}
				</p>
			{:else}
				<div class="space-y-1">
					{#each recentHealth as event (event.id)}
						<button
							type="button"
							onclick={() => openDetail({ kind: 'health', item: event })}
							class="w-full flex items-center gap-3 text-sm rounded-md px-2 py-1.5 -mx-2
								hover:bg-accent transition-colors text-left"
						>
							<span class="w-24 shrink-0 text-xs text-muted-foreground whitespace-nowrap">
								<LocalTime date={event.occurredAt} />
							</span>
							<Badge variant="bark" class="capitalize">{event.type.replace('_', ' ')}</Badge>
							<span class="truncate text-foreground">{event.title}</span>
						</button>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>
</div>
