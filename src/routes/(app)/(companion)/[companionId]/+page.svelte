<script lang="ts">
	import type { PageData } from './$types';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import WeightSparkline from '$lib/components/WeightSparkline.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
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
		FileText,
		X,
		CheckCheck,
		Activity,
		TrendingUp
	} from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import { renderMarkdown, stripMarkdown } from '$lib/markdown';
	import { ACTIVITY_ICONS, REMINDER_ICONS } from '$lib/i18n/labels';
	import { REMINDER_TO_HEALTH_TYPE } from '$lib/health';
	import ReminderCompleteButtons from '$lib/components/reminders/ReminderCompleteButtons.svelte';
	import { t, getLocale } from '$lib/i18n';
	import type { MessageKey } from '$lib/i18n/en';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';
	import { clearSubmittingFlag } from '$lib/clearSubmittingFlag';
	import { formatRecurrence } from '$lib/reminderRecurrence';
	import { careStatus } from '$lib/careStatus';
	import DocumentPreview from '$lib/components/DocumentPreview.svelte';

	let { data }: { data: PageData } = $props();
	let {
		companion,
		recentHealth,
		recentDaily,
		upcomingReminders,
		recentWeights,
		activeCaretakerShift,
		recentDocuments
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

	const ACTIVITY_ICON = ACTIVITY_ICONS;

	// Care status derived from outstanding reminders
	let status = $derived(
		careStatus(
			upcomingReminders.map((r) => ({ dueAt: r.dueAt, completedAt: r.completedAt ?? null }))
		)
	);

	// Quick stats derived from loaded data
	let latestWeight = $derived(recentWeights.length > 0 ? recentWeights[0] : null);
	let nextReminder = $derived(upcomingReminders.length > 0 ? upcomingReminders[0] : null);
	let activityCount = $derived(recentDaily.length);

	// Weight sparkline points — map weight+recordedAt to {date, kg}
	// We show in whatever unit is stored; the sparkline uses raw numeric values
	let sparklinePoints = $derived(
		[...recentWeights].reverse().map((w) => ({ date: w.recordedAt, kg: w.weight }))
	);

	// Merged activity timeline: recentDaily + recentHealth, newest first, capped at 8
	type ActivityItem =
		| { kind: 'activity'; ts: Date; item: (typeof recentDaily)[0] }
		| { kind: 'health'; ts: Date; item: (typeof recentHealth)[0] };

	let activityTimeline = $derived(
		(
			[
				...recentDaily.map((e) => ({
					kind: 'activity' as const,
					ts: new Date(e.loggedAt),
					item: e
				})),
				...recentHealth.map((e) => ({
					kind: 'health' as const,
					ts: new Date(e.occurredAt),
					item: e
				}))
			] as ActivityItem[]
		)
			.filter((e) => e.ts.getTime() <= Date.now())
			.sort((a, b) => b.ts.getTime() - a.ts.getTime())
			.slice(0, 8)
	);

	// Reminder urgency
	function reminderUrgency(dueAt: Date | string): 'overdue' | 'today' | 'upcoming' {
		const dueMs = new Date(dueAt).getTime();
		const nowMs = Date.now();
		if (dueMs < nowMs) return 'overdue';
		// compute end-of-today in local time by extracting date parts
		const d = new Date(nowMs);
		const todayEndMs = new Date(
			d.getFullYear(),
			d.getMonth(),
			d.getDate(),
			23,
			59,
			59,
			999
		).getTime();
		if (dueMs <= todayEndMs) return 'today';
		return 'upcoming';
	}

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

	// Document preview
	type RecentDoc = (typeof recentDocuments)[0];
	let previewDoc = $state<RecentDoc | null>(null);
	function docUrl(doc: RecentDoc) {
		return `/api/documents/${companion.id}/${doc.filename}`;
	}

	function closeAvatarLightbox() {
		avatarLightboxOpen = false;
		(document.activeElement as HTMLElement)?.blur();
	}

	// Pending reminder dismissals
	const undoDelayMs = $derived((data.reminderUndoSeconds ?? 0) * 1000);
	const pendingDismiss = createPendingDismissals(
		() => locale,
		() => undoDelayMs
	);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();

	$effect(() => () => pendingDismiss.cleanup());

	function submitWithAndEvent(reminderId: string) {
		const form = dismissFormRegistry.get(reminderId);
		if (!form) {
			console.warn('Reminder dismiss form not found for', reminderId);
			return;
		}
		pendingDismiss.commitWithEvent(reminderId, form);
	}

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (avatarLightboxOpen) {
				closeAvatarLightbox();
				return;
			}
			if (previewDoc) {
				previewDoc = null;
				return;
			}
			if (selected) {
				closeDetail();
				return;
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
							<span class="text-foreground">{formatRecurrence(r, locale, 'full')}</span>
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
					<ByLine user={r.logger} />
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
						<span class="text-foreground"
							><LocalTime date={w.recordedAt} format="datetime" /><ByLine
								user={w.logger}
								variant="inline"
							/></span
						>
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
						<span class="text-foreground"
							><LocalTime date={e.loggedAt} format="datetime" /><ByLine
								user={e.logger}
								variant="inline"
							/></span
						>
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
						<Badge variant="gold" class="capitalize">{h.type.replace('_', ' ')}</Badge>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.modalLabelDate')}</span
						>
						<span class="text-foreground"
							><LocalTime date={h.occurredAt} format="datetime" /><ByLine
								user={h.logger}
								variant="inline"
							/></span
						>
					</div>
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
							variant="soft"
							size="sm"
							onclick={closeDetail}
						>
							<Pencil class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'page.dashboard.modalEditReminders')}
						</Button>
						<Button
							variant="softSuccess"
							size="sm"
							onclick={() => {
								if (selected?.kind !== 'reminder') return;
								const item = selected.item;
								const form = dismissFormRegistry.get(item.id);
								if (!form) return;
								closeDetail();
								pendingDismiss.queue(item.id, form, item.title, { allowLogEvent: true });
							}}
						>
							<CheckCheck class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'common.reminder.done')}
						</Button>
						<Button
							variant="softPrimary"
							size="sm"
							aria-label={t(locale, 'common.reminder.logEventAria')}
							onclick={() => {
								if (selected?.kind !== 'reminder') return;
								const item = selected.item;
								closeDetail();
								submitWithAndEvent(item.id);
							}}
						>
							<HeartPulse class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'common.reminder.logEventShort')}
						</Button>
					{:else if selected.kind === 'weight' || selected.kind === 'health'}
						<Button
							href="/{companion.id}/health?edit={selected.item.id}"
							variant="soft"
							size="sm"
							onclick={closeDetail}
						>
							<Pencil class="h-3.5 w-3.5 mr-1.5" />
							{t(locale, 'page.dashboard.modalEditHealth')}
						</Button>
					{:else if selected.kind === 'activity'}
						<Button
							href="/{companion.id}/journal/{eventDate(selected.item.loggedAt)}"
							variant="soft"
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

<div class="space-y-4 pb-20 md:pb-0">
	{#if !companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.dashboard.archivedBanner', { name: companion.name })}
		</div>
	{/if}

	<!-- Hero card: gradient wash, avatar, name, quick stats -->
	<Card class="overflow-hidden">
		<div
			class="relative px-5 py-6"
			style="background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--color-teal) 25%, transparent), transparent 55%), radial-gradient(120% 140% at 0% 120%, color-mix(in srgb, var(--color-coral) 20%, transparent), transparent 55%), var(--color-card);"
		>
			<!-- Caretaker on shift indicator -->
			{#if activeCaretakerShift}
				<div class="flex items-center gap-1.5 mb-4 text-xs font-medium text-teal">
					<UserCheck class="h-3.5 w-3.5 shrink-0" />
					<span
						>{t(locale, 'page.dashboard.caretakerOnShift')} — {activeCaretakerShift.displayName},
						{t(locale, 'page.dashboard.shiftEnds')}
						<LocalTime date={activeCaretakerShift.endAt} /></span
					>
				</div>
			{/if}

			<!-- Avatar + name row -->
			<div class="flex items-start gap-4">
				<CompanionAvatar
					companionId={companion.id}
					avatarPath={companion.avatarPath}
					name={companion.name}
					size="lg"
					onlightbox={avatarUrl ? () => (avatarLightboxOpen = true) : undefined}
				/>
				<div class="flex-1 min-w-0">
					<div class="flex items-start justify-between gap-2">
						<h1 class="font-display text-2xl font-bold text-foreground leading-tight">
							{companion.name}
						</h1>
						{#if companion.isActive !== false}
							<Button href="/companions/{companion.id}/edit" variant="soft" size="sm">
								<Pencil class="h-3.5 w-3.5 mr-1.5" />
								{t(locale, 'common.edit')}
							</Button>
						{/if}
					</div>
					<p class="text-sm text-muted-foreground mt-0.5">
						{companion.breed ?? t(locale, 'page.dashboard.mixedBreed')} · {age(
							companion.dob
						)}{companion.sex ? ` · ${companion.sex}` : ''}
					</p>
					<div class="mt-2">
						{#if status === 'up-to-date'}
							<Badge variant="teal" class="text-xs">
								<HeartPulse class="h-3 w-3 mr-1" />
								{t(locale, 'overview.careStatus.upToDate')}
							</Badge>
						{:else if status === 'due-today'}
							<Badge variant="gold" class="text-xs">
								<HeartPulse class="h-3 w-3 mr-1" />
								{t(locale, 'overview.careStatus.dueToday')}
							</Badge>
						{:else}
							<Badge variant="coral" class="text-xs">
								<HeartPulse class="h-3 w-3 mr-1" />
								{t(locale, 'overview.careStatus.needsAttention')}
							</Badge>
						{/if}
					</div>
				</div>
			</div>

			<!-- Quick stats row -->
			<div class="mt-5 flex flex-wrap gap-4">
				<!-- Latest weight -->
				<div class="flex flex-col gap-0.5">
					<span class="text-xs text-muted-foreground font-medium uppercase tracking-wide"
						>{t(locale, 'page.dashboard.cardWeight')}</span
					>
					{#if latestWeight}
						<span class="text-base font-bold text-foreground"
							>{latestWeight.weight}
							<span class="text-xs font-normal text-muted-foreground">{latestWeight.unit}</span
							></span
						>
					{:else}
						<span class="text-sm text-muted-foreground italic">—</span>
					{/if}
				</div>

				<!-- Next reminder -->
				<div class="flex flex-col gap-0.5">
					<span class="text-xs text-muted-foreground font-medium uppercase tracking-wide"
						>{t(locale, 'page.dashboard.nextVet')}</span
					>
					{#if nextReminder}
						<span class="text-base font-bold text-foreground truncate max-w-[140px]"
							>{nextReminder.title}</span
						>
					{:else}
						<span class="text-base font-bold text-muted-foreground italic">—</span>
					{/if}
				</div>

				<!-- Activity count -->
				<div class="flex flex-col gap-0.5">
					<span class="text-xs text-muted-foreground font-medium uppercase tracking-wide"
						>{t(locale, 'page.dashboard.cardActivity')}</span
					>
					<span class="text-base font-bold text-foreground"
						>{t(locale, 'page.dashboard.heroRecentActivity', {
							count: String(activityCount)
						})}</span
					>
				</div>
			</div>
		</div>
	</Card>

	<!-- Main grid: single col on mobile, 2-col on md+ -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<!-- Upcoming reminders card -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<Bell class="h-4 w-4" />
						{t(locale, 'page.dashboard.cardUpcomingReminders')}
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
			<CardContent class="pt-0">
				{#if upcomingReminders.length === 0}
					<EmptyState tint="muted" title={t(locale, 'page.dashboard.noUpcomingReminders')}>
						{#snippet icon()}<Bell class="h-5 w-5" />{/snippet}
					</EmptyState>
				{:else}
					<div class="space-y-1">
						{#each upcomingReminders.slice(0, 5) as reminder (reminder.id)}
							{@const urgency = reminderUrgency(reminder.dueAt)}
							{@const allowLogEvent =
								REMINDER_TO_HEALTH_TYPE[reminder.type as keyof typeof REMINDER_TO_HEALTH_TYPE] !==
								null}
							<div class="flex items-center gap-1 -mx-2 rounded-md transition-colors">
								<button
									type="button"
									onclick={() => openDetail({ kind: 'reminder', item: reminder })}
									class="flex-1 flex items-center gap-3 text-sm rounded-md px-2 py-2
										hover:bg-accent transition-colors text-left min-w-0"
								>
									<!-- type icon -->
									<span
										class="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-sm
										{urgency === 'overdue'
											? 'bg-coral/15 text-coral'
											: urgency === 'today'
												? 'bg-gold/15 text-gold'
												: 'bg-teal/10 text-teal'}"
									>
										{REMINDER_ICONS[reminder.type] ?? '📌'}
									</span>
									<div class="flex-1 min-w-0">
										<p class="truncate text-foreground font-medium text-xs">
											{reminder.title}
										</p>
										{#if reminder.isRecurring}
											<p class="text-xs text-muted-foreground truncate">
												{formatRecurrence(reminder, locale, 'short')}
											</p>
										{/if}
									</div>
									<!-- due chip -->
									<Badge
										variant={urgency === 'overdue'
											? 'coral'
											: urgency === 'today'
												? 'gold'
												: 'secondary'}
										class="shrink-0 text-xs"
									>
										{#if urgency === 'overdue'}
											{t(locale, 'page.dashboard.reminderOverdue')}
										{:else if urgency === 'today'}
											{t(locale, 'page.dashboard.reminderToday')}
										{:else}
											<LocalTime date={reminder.dueAt} />
										{/if}
									</Badge>
								</button>
								<ReminderCompleteButtons
									onDone={() => {
										const form = dismissFormRegistry.get(reminder.id);
										if (form)
											pendingDismiss.queue(reminder.id, form, reminder.title, { allowLogEvent });
									}}
									onDoneAndLog={() => submitWithAndEvent(reminder.id)}
									{allowLogEvent}
								/>
							</div>
						{/each}
					</div>
					<!-- Hidden dismiss forms -->
					{#each upcomingReminders.slice(0, 5) as reminder (reminder.id + '-form')}
						<form
							method="POST"
							action="?/complete"
							use:enhance={clearSubmittingFlag}
							use:registerDismissForm={{ id: reminder.id, registry: dismissFormRegistry }}
							class="hidden"
						>
							<input type="hidden" name="id" value={reminder.id} />
						</form>
					{/each}
				{/if}
			</CardContent>
		</Card>

		<!-- Weight trend card -->
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<Scale class="h-4 w-4" />
						{t(locale, 'page.dashboard.cardWeightTrend')}
					</CardTitle>
					<Button
						href="/{companion.id}/health"
						variant="ghost"
						size="sm"
						class="h-7 text-xs text-primary px-2"
					>
						{t(locale, 'page.dashboard.weightTrendViewHealth')}
					</Button>
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				{#if recentWeights.length === 0}
					<EmptyState tint="muted" title={t(locale, 'page.dashboard.weightTrendEmpty')}>
						{#snippet icon()}<TrendingUp class="h-5 w-5" />{/snippet}
					</EmptyState>
				{:else}
					{@const latest = recentWeights[0]}
					<div class="flex items-end justify-between gap-4">
						<div>
							<button
								type="button"
								onclick={() => openDetail({ kind: 'weight', item: latest })}
								class="text-left rounded-md hover:bg-accent transition-colors px-1 py-0.5 -ml-1"
							>
								<p class="text-2xl font-bold text-foreground leading-none">
									{latest.weight}<span class="text-sm font-normal ml-1 text-muted-foreground"
										>{latest.unit}</span
									>
								</p>
								<p class="text-xs mt-1 text-muted-foreground">
									{t(locale, 'page.dashboard.weightAsOf')}
									<LocalTime date={latest.recordedAt} />
								</p>
							</button>
						</div>
						{#if sparklinePoints.length >= 2}
							<div class="text-teal shrink-0">
								<WeightSparkline points={sparklinePoints} width={120} height={40} />
							</div>
						{/if}
					</div>
				{/if}
			</CardContent>
		</Card>
	</div>

	<!-- Recent activity timeline (full width) -->
	<Card>
		<CardHeader class="pb-3">
			<div class="flex items-center justify-between">
				<CardTitle class="text-sm font-semibold flex items-center gap-2">
					<ClipboardList class="h-4 w-4" />
					{t(locale, 'page.dashboard.cardRecentActivity')}
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
			{#if activityTimeline.length === 0}
				<EmptyState tint="muted" title={t(locale, 'page.dashboard.activityEmpty')}>
					{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-0.5">
					{#each activityTimeline as entry (entry.item.id)}
						{#if entry.kind === 'activity'}
							{@const event = entry.item}
							<button
								type="button"
								onclick={() => openDetail({ kind: 'activity', item: event })}
								class="w-full rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors text-left"
							>
								<div class="flex items-center gap-3 text-sm">
									<span
										class="w-7 h-7 shrink-0 rounded-lg bg-secondary flex items-center justify-center text-base"
									>
										{ACTIVITY_ICON[event.type] ?? '📝'}
									</span>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<Badge variant="secondary" class="capitalize text-xs">{event.type}</Badge>
											{#if event.notes}
												<span class="truncate text-xs text-muted-foreground">
													{stripMarkdown(event.notes)}
												</span>
											{/if}
										</div>
										<div class="flex items-center gap-1 mt-0.5">
											<span class="text-xs text-muted-foreground">
												<LocalTime date={event.loggedAt} format="relative" />
											</span>
											{#if event.logger}
												<ByLine user={event.logger} variant="inline" />
											{/if}
										</div>
									</div>
								</div>
							</button>
						{:else if entry.kind === 'health'}
							{@const event = entry.item}
							<button
								type="button"
								onclick={() => openDetail({ kind: 'health', item: event })}
								class="w-full rounded-md px-2 py-2 -mx-2 hover:bg-accent transition-colors text-left"
							>
								<div class="flex items-center gap-3 text-sm">
									<span
										class="w-7 h-7 shrink-0 rounded-lg bg-gold/15 flex items-center justify-center text-base"
									>
										<HeartPulse class="h-3.5 w-3.5 text-gold" />
									</span>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<Badge variant="gold" class="capitalize text-xs"
												>{event.type.replace('_', ' ')}</Badge
											>
											<span class="truncate text-xs text-foreground">{event.title}</span>
										</div>
										<div class="flex items-center gap-1 mt-0.5">
											<span class="text-xs text-muted-foreground">
												<LocalTime date={event.occurredAt} format="relative" />
											</span>
											{#if event.logger}
												<ByLine user={event.logger} variant="inline" />
											{/if}
										</div>
									</div>
								</div>
							</button>
						{/if}
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Recent documents (if any) -->
	{#if recentDocuments.length > 0}
		<Card>
			<CardHeader class="pb-3">
				<div class="flex items-center justify-between">
					<CardTitle class="text-sm font-semibold flex items-center gap-2">
						<FileText class="h-4 w-4" />
						{t(locale, 'page.documents.title')}
					</CardTitle>
					<Button
						href="/{companion.id}/documents"
						variant="ghost"
						size="sm"
						class="h-7 text-xs text-primary px-2"
					>
						{t(locale, 'page.dashboard.healthViewAll')}
					</Button>
				</div>
			</CardHeader>
			<CardContent class="pt-0">
				<div class="space-y-1">
					{#each recentDocuments as doc (doc.id)}
						<button
							type="button"
							onclick={() => (previewDoc = doc)}
							class="block w-full rounded-md px-2 py-1.5 -mx-2 hover:bg-accent transition-colors text-left"
						>
							<div class="flex items-center justify-between gap-3 text-sm">
								<span class="truncate text-foreground text-sm">{doc.title}</span>
								<Badge variant="gold" class="capitalize shrink-0"
									>{t(locale, `documents.category.${doc.category}` as MessageKey)}</Badge
								>
							</div>
						</button>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}
</div>

{#if previewDoc}
	<DocumentPreview
		open={true}
		url={docUrl(previewDoc)}
		mimeType={previewDoc.mimeType}
		title={previewDoc.title}
		onclose={() => (previewDoc = null)}
	/>
{/if}
