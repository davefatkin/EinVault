<script lang="ts">
	import type { PageData } from './$types';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Phone, Mail, X, Bell, Activity } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { enhance } from '$app/forms';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { renderMarkdown, stripMarkdown } from '$lib/markdown';
	import { ACTIVITY_ICONS, activityTypeOptions } from '$lib/i18n/labels';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';
	import { clearSubmittingFlag } from '$lib/clearSubmittingFlag';
	import { formatRecurrence } from '$lib/reminderRecurrence';
	import ReminderCompleteButtons from '$lib/components/reminders/ReminderCompleteButtons.svelte';

	let { data }: { data: PageData } = $props();
	let { companion, todayActivity, latestWeight, owners, upcomingReminders } = $derived(data);

	const locale = getLocale();
	const quickLogTypes = activityTypeOptions(locale).filter((opt) =>
		['walk', 'meal', 'bathroom'].includes(opt.value)
	);

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

	// Avatar lightbox
	let avatarLightboxOpen = $state(false);
	let avatarUrl = $derived(companion.avatarPath ? `/api/avatars/${companion.id}` : null);

	function closeAvatarLightbox() {
		avatarLightboxOpen = false;
		(document.activeElement as HTMLElement)?.blur();
	}

	// Detail modal
	let selected = $state<(typeof todayActivity)[0] | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	async function openDetail(event: (typeof todayActivity)[0]) {
		selected = event;
		await tick();
		dialogEl?.focus();
	}

	function closeDetail() {
		selected = null;
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

	// Reminder detail modal
	let selectedReminder = $state<(typeof upcomingReminders)[0] | null>(null);
	let reminderDialogEl = $state<HTMLElement | null>(null);

	async function openReminderDetail(reminder: (typeof upcomingReminders)[0]) {
		selectedReminder = reminder;
		await tick();
		reminderDialogEl?.focus();
	}

	function closeReminderDetail() {
		selectedReminder = null;
	}

	function trapReminderFocus(e: KeyboardEvent) {
		if (!reminderDialogEl) return;
		const focusable = Array.from(
			reminderDialogEl.querySelectorAll<HTMLElement>(
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

	let visibleOwners = $derived((owners ?? []).filter((o) => o.phone || o.email));
	let hasVetInfo = $derived(!!(companion.vetName || companion.vetClinic || companion.vetPhone));
	let hasEmergencyContact = $derived(
		!!(companion.emergencyContactName || companion.emergencyContactPhone)
	);

	// Pending reminder dismissals
	const undoDelayMs = $derived((data.reminderUndoSeconds ?? 0) * 1000);
	const pendingDismiss = createPendingDismissals(
		() => locale,
		() => undoDelayMs
	);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();

	$effect(() => () => pendingDismiss.cleanup());

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (avatarLightboxOpen) {
				closeAvatarLightbox();
				return;
			}
			if (selectedReminder) {
				closeReminderDetail();
				return;
			}
			if (selected) {
				closeDetail();
				return;
			}
		}
	}
</script>

<svelte:window onkeydown={handleWindowKey} />

<svelte:head>
	<title>{companion.name} | Caretaker | EinVault</title>
</svelte:head>

<!-- Avatar lightbox -->
{#if avatarLightboxOpen && avatarUrl}
	<div
		role="dialog"
		aria-modal="true"
		aria-label="{companion.name}'s photo"
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
					aria-label={t(locale, 'common.close')}
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

<!-- Activity detail modal -->
{#if selected}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'page.dashboard.caretaker.closeDialog')}
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
					{ACTIVITY_ICONS[selected.type] ?? '📝'}
					{selected.type.charAt(0).toUpperCase() + selected.type.slice(1)}
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
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.caretaker.modalLabelType')}</span
					>
					<Badge variant="secondary" class="capitalize">{selected.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.caretaker.modalLabelLogged')}</span
					>
					<span class="text-foreground"
						><LocalTime date={selected.loggedAt} format="datetime" /><ByLine
							user={selected.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if selected.durationMinutes}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.caretaker.modalLabelDuration')}</span
						>
						<span class="text-foreground">{selected.durationMinutes} min</span>
					</div>
				{/if}
				{#if selected.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.dashboard.caretaker.modalLabelNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(selected.notes)}
						</div>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- Reminder detail modal -->
{#if selectedReminder}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'page.dashboard.caretaker.closeDialog')}
			onclick={closeReminderDetail}
		></button>
		<div
			bind:this={reminderDialogEl}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			onkeydown={trapReminderFocus}
			class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
				animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
		>
			<div class="flex items-center justify-between px-5 pt-5 pb-3">
				<h2 class="font-semibold text-base text-foreground">{selectedReminder.title}</h2>
				<button
					onclick={closeReminderDetail}
					aria-label={t(locale, 'common.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.caretaker.modalLabelType')}</span
					>
					<Badge variant="secondary" class="capitalize">{selectedReminder.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.dashboard.caretaker.modalLabelDue')}</span
					>
					<span
						class={new Date(selectedReminder.dueAt) < new Date() ? 'text-coral' : 'text-foreground'}
					>
						<LocalTime date={selectedReminder.dueAt} format="datetime" />
					</span>
				</div>
				{#if selectedReminder.isRecurring}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.caretaker.modalLabelRepeats')}</span
						>
						<span class="text-foreground">{formatRecurrence(selectedReminder, locale, 'full')}</span
						>
					</div>
				{/if}
				{#if selectedReminder.description}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.dashboard.caretaker.modalLabelNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(selectedReminder.description)}
						</div>
					</div>
				{/if}
				<ByLine user={selectedReminder.logger} />
			</div>

			<Separator />

			<div class="flex gap-2 px-5 py-4">
				<ReminderCompleteButtons
					allowLogEvent={false}
					onDone={() => {
						if (!selectedReminder) return;
						const item = selectedReminder;
						const form = dismissFormRegistry.get(item.id);
						if (!form) return;
						closeReminderDetail();
						pendingDismiss.queue(item.id, form, item.title);
					}}
				/>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-5">
	<!-- 1. Companion hero -->
	<div
		class="rounded-2xl border bg-card overflow-hidden"
		style="background: radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--color-teal) 20%, transparent), transparent 55%), radial-gradient(120% 140% at 0% 120%, color-mix(in srgb, var(--color-coral) 15%, transparent), transparent 55%), var(--color-card);"
	>
		<div class="px-5 py-6">
			<div class="flex items-start gap-4">
				<CompanionAvatar
					companionId={companion.id}
					avatarPath={companion.avatarPath}
					name={companion.name}
					size="lg"
					onlightbox={avatarUrl ? () => (avatarLightboxOpen = true) : undefined}
				/>
				<div class="flex-1 min-w-0">
					<h1 class="font-display text-2xl font-bold text-foreground leading-tight">
						{companion.name}
					</h1>
					<p class="text-sm text-muted-foreground mt-0.5">
						{companion.breed ?? t(locale, 'page.dashboard.mixedBreed')} · {age(
							companion.dob
						)}{companion.sex ? ` · ${companion.sex}` : ''}
					</p>
					{#if companion.microchip}
						<p class="text-xs text-muted-foreground mt-1">
							{t(locale, 'page.dashboard.caretaker.microchip', { id: companion.microchip })}
						</p>
					{/if}
					{#if latestWeight}
						<div class="mt-2 flex items-baseline gap-1">
							<span class="text-base font-bold text-foreground"
								>{latestWeight.weight}<span class="text-xs font-normal ml-0.5 text-muted-foreground"
									>{latestWeight.unit}</span
								></span
							>
							<span class="text-xs text-muted-foreground">
								· {t(locale, 'page.dashboard.caretaker.weightAsOf')}
								<LocalTime date={latestWeight.recordedAt} /></span
							>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- 1b. Bio / About (reference) -->
	{#if companion.bio}
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				{t(locale, 'page.dashboard.caretaker.cardAbout', { name: companion.name })}
			</h2>
			<div class="prose prose-sm dark:prose-invert max-w-none">
				{@html renderMarkdown(companion.bio)}
			</div>
		</section>
	{/if}

	<!-- 2. Today's tasks (on-shift only) -->
	{#if data.isOnShift}
		<section>
			<div class="mb-3 flex items-center gap-1.5">
				<h2
					class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
				>
					<Bell class="h-3.5 w-3.5" />
					{t(locale, 'page.dashboard.caretaker.cardReminders')}
				</h2>
				{#if upcomingReminders.length > 0}
					<Badge variant="secondary">{upcomingReminders.length}</Badge>
				{/if}
			</div>
			{#if upcomingReminders.length === 0}
				<EmptyState tint="muted" title={t(locale, 'page.dashboard.caretaker.remindersEmpty')}>
					{#snippet icon()}<Bell class="h-5 w-5" />{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-1">
					{#each upcomingReminders as reminder (reminder.id)}
						{@const isOverdue = new Date(reminder.dueAt) < new Date()}
						<div class="flex items-center gap-2 rounded-lg">
							<button
								type="button"
								onclick={() => openReminderDetail(reminder)}
								class="flex-1 flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-accent transition-colors text-left min-w-0"
							>
								<span class="truncate text-foreground">{reminder.title}</span>
								{#if isOverdue}
									<Badge variant="coral" class="shrink-0 text-xs"
										>{t(locale, 'page.dashboard.caretaker.reminderOverdue')}</Badge
									>
								{/if}
								<span
									class="ml-auto shrink-0 text-xs {isOverdue
										? 'text-coral'
										: 'text-muted-foreground'}"
								>
									<LocalTime date={reminder.dueAt} format="datetime" />
								</span>
							</button>
							<form
								method="POST"
								action="?/complete"
								use:enhance={clearSubmittingFlag}
								use:registerDismissForm={{
									id: reminder.id,
									registry: dismissFormRegistry
								}}
								class="flex items-center gap-1 shrink-0"
							>
								<input type="hidden" name="id" value={reminder.id} />
								<ReminderCompleteButtons
									allowLogEvent={false}
									onDone={() => {
										const form = dismissFormRegistry.get(reminder.id);
										if (form) pendingDismiss.queue(reminder.id, form, reminder.title);
									}}
								/>
							</form>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- 3. Quick log -->
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
				{t(locale, 'page.dashboard.caretaker.sectionQuickLog')}
			</h2>
			<div class="flex gap-2">
				{#each quickLogTypes as opt (opt.value)}
					<a
						href="/care/{companion.id}/log?type={opt.value}"
						class="flex-1 flex flex-col items-center gap-1 rounded-xl border border-border bg-card p-3 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
					>
						<span class="text-lg">{opt.icon}</span>
						<span>{opt.label}</span>
					</a>
				{/each}
				<a
					href="/care/{companion.id}/log"
					class="flex-1 flex flex-col items-center gap-1 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
				>
					<span class="text-lg">+</span>
					<span>{t(locale, 'page.dashboard.caretaker.logActivity')}</span>
				</a>
			</div>
		</section>
	{/if}

	<!-- 4a. Schedules (reference): 1–3 cards, evenly spaced across one row (flex-1 each) -->
	{#if companion.feedingSchedule || companion.walkSchedule || companion.medicationSchedule}
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
				{t(locale, 'page.dashboard.caretaker.sectionSchedules')}
			</h2>
			<div class="flex flex-col sm:flex-row gap-4">
				{#if companion.feedingSchedule}
					<div class="flex-1 min-w-0 rounded-xl border border-border bg-card p-4">
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>🍖</span>
							{t(locale, 'page.dashboard.caretaker.cardFeeding')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(companion.feedingSchedule)}
						</div>
					</div>
				{/if}
				{#if companion.walkSchedule}
					<div class="flex-1 min-w-0 rounded-xl border border-border bg-card p-4">
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>🦮</span>
							{t(locale, 'page.dashboard.caretaker.cardWalk')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(companion.walkSchedule)}
						</div>
					</div>
				{/if}
				{#if companion.medicationSchedule}
					<div class="flex-1 min-w-0 rounded-xl border border-border bg-card p-4">
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>💊</span>
							{t(locale, 'page.dashboard.caretaker.cardMedicationSchedule')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(companion.medicationSchedule)}
						</div>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- 4b. Sitter notes (reference) -->
	{#if companion.notesForSitter}
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				{t(locale, 'page.dashboard.caretaker.cardSitterNotes')}
			</h2>
			<div class="prose prose-sm dark:prose-invert max-w-none">
				{@html renderMarkdown(companion.notesForSitter)}
			</div>
		</section>
	{/if}

	<!-- 4c. Contacts (reference): vet + emergency prioritized, then household -->
	{#if hasVetInfo || hasEmergencyContact || visibleOwners.length > 0}
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
				{t(locale, 'page.dashboard.caretaker.sectionContacts')}
			</h2>
			<div class="flex flex-col sm:flex-row gap-4">
				{#if hasVetInfo}
					<div class="flex-1 min-w-0 rounded-xl border border-border bg-card p-4 space-y-1 text-sm">
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>🏥</span>
							{t(locale, 'page.dashboard.caretaker.cardVetInfo')}
						</p>
						{#if companion.vetName}<p class="font-medium">{companion.vetName}</p>{/if}
						{#if companion.vetClinic}<p class="text-muted-foreground">{companion.vetClinic}</p>{/if}
						{#if companion.vetPhone}
							📞 <a
								href="tel:{companion.vetPhone}"
								class="hover:underline font-medium text-primary-link">{companion.vetPhone}</a
							>
						{/if}
					</div>
				{/if}
				{#if hasEmergencyContact}
					<div
						class="flex-1 min-w-0 rounded-xl border border-coral/30 bg-card p-4 space-y-1 text-sm"
					>
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>🚨</span>
							{t(locale, 'page.dashboard.caretaker.cardEmergencyContact')}
						</p>
						{#if companion.emergencyContactName}
							<p class="font-medium">{companion.emergencyContactName}</p>
						{/if}
						{#if companion.emergencyContactPhone}
							📞 <a
								href="tel:{companion.emergencyContactPhone}"
								class="text-coral hover:underline font-medium text-base"
								>{companion.emergencyContactPhone}</a
							>
						{/if}
					</div>
				{/if}
				{#if visibleOwners.length > 0}
					<div class="flex-1 min-w-0 rounded-xl border border-border bg-card p-4 space-y-3">
						<p class="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
							<span>🏠</span>
							{visibleOwners.length === 1
								? t(locale, 'page.dashboard.caretaker.householdOwner')
								: t(locale, 'page.dashboard.caretaker.householdContacts')}
						</p>
						{#each visibleOwners as owner (owner.id)}
							<div class="space-y-1">
								<p class="font-semibold text-foreground">{owner.displayName}</p>
								{#if owner.phone}
									<a
										href="tel:{owner.phone}"
										class="flex items-center gap-2 text-sm text-primary-link hover:underline"
									>
										<Phone class="h-4 w-4" />{owner.phone}
									</a>
								{/if}
								{#if owner.email}
									<a
										href="mailto:{owner.email}"
										class="flex items-center gap-2 text-sm text-muted-foreground hover:underline"
									>
										<Mail class="h-4 w-4" />{owner.email}
									</a>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<!-- 5. Today's activity -->
	{#if data.isOnShift}
		<section>
			<h2 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
				📋 {t(locale, 'page.dashboard.caretaker.cardTodayActivity')}
			</h2>
			{#if todayActivity.length === 0}
				<EmptyState tint="muted" title={t(locale, 'page.dashboard.caretaker.activityEmpty')}>
					{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-1">
					{#each todayActivity as event (event.id)}
						<button
							type="button"
							onclick={() => openDetail(event)}
							class="w-full rounded-lg px-2 py-1.5 hover:bg-accent transition-colors text-left"
						>
							<div class="flex items-center gap-3 text-sm">
								<span class="text-base shrink-0">{ACTIVITY_ICONS[event.type] ?? '📝'}</span>
								<Badge variant="secondary" class="capitalize shrink-0">{event.type}</Badge>
								{#if event.durationMinutes}
									<span class="text-xs text-muted-foreground shrink-0"
										>{event.durationMinutes} min</span
									>
								{/if}
								{#if event.notes}
									<span class="truncate text-muted-foreground text-xs"
										>{stripMarkdown(event.notes)}</span
									>
								{/if}
								<span class="ml-auto text-xs shrink-0 text-muted-foreground">
									<LocalTime date={event.loggedAt} format="time" />
								</span>
							</div>
							<ByLine user={event.logger} class="pl-8" />
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>
