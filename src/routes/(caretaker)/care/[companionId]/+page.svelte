<script lang="ts">
	import type { PageData } from './$types';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Card, CardHeader, CardContent, CardTitle } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Phone, Mail, X, Bell, CheckCheck, Undo2 } from '@lucide/svelte';
	import { enhance } from '$app/forms';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { renderMarkdown } from '$lib/markdown';
	import { ACTIVITY_ICONS } from '$lib/i18n/labels';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';

	let { data }: { data: PageData } = $props();
	let { companion, medications, todayActivity, latestWeight, owners, upcomingReminders } =
		$derived(data);

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
			pendingDismiss.undoLast((id) => upcomingReminders.find((r) => r.id === id)?.title);
		}
	}

	let visibleOwners = $derived((owners ?? []).filter((o) => o.phone || o.email));

	// Pending reminder dismissals
	const undoDelayMs = $derived((data.reminderUndoSeconds ?? 7) * 1000);
	const pendingDismiss = createPendingDismissals(getLocale, () => undoDelayMs);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();

	$effect(() => () => pendingDismiss.cleanup());
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
						class={new Date(selectedReminder.dueAt) < new Date()
							? 'text-destructive'
							: 'text-foreground'}
					>
						<LocalTime date={selectedReminder.dueAt} format="datetime" />
					</span>
				</div>
				{#if selectedReminder.isRecurring}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.dashboard.caretaker.modalLabelRepeats')}</span
						>
						<span class="text-foreground"
							>Every {selectedReminder.recurringDays} day{selectedReminder.recurringDays !== 1
								? 's'
								: ''}</span
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
				<button
					type="button"
					onclick={() => {
						if (!selectedReminder) return;
						const item = selectedReminder;
						const form = dismissFormRegistry.get(item.id);
						if (!form) return;
						closeReminderDetail();
						pendingDismiss.queue(item.id, form, item.title);
					}}
					class="inline-flex items-center gap-1.5 justify-center rounded-md bg-primary text-primary-foreground h-9 px-3 text-sm font-medium shadow hover:bg-primary/90 transition-colors"
				>
					<CheckCheck class="h-3.5 w-3.5" />
					{t(locale, 'common.reminder.done')}
				</button>
			</div>
		</div>
	</div>
{/if}

<div class="space-y-5">
	<!-- Companion card -->
	<Card class="overflow-hidden">
		<div class="bg-gradient-to-r from-moss-600 to-moss-700 px-6 py-5 text-white">
			<div class="flex items-center gap-4">
				<CompanionAvatar
					companionId={companion.id}
					avatarPath={companion.avatarPath}
					name={companion.name}
					size="lg"
					onlightbox={avatarUrl ? () => (avatarLightboxOpen = true) : undefined}
				/>
				<div>
					<h1 class="font-display text-2xl font-bold">{companion.name}</h1>
					<p class="text-moss-100 text-sm">
						{companion.breed ?? t(locale, 'page.dashboard.mixedBreed')} · {age(
							companion.dob
						)}{companion.sex ? ` · ${companion.sex}` : ''}
					</p>
					{#if companion.microchip}
						<p class="text-moss-200 text-xs mt-1">
							{t(locale, 'page.dashboard.caretaker.microchip', { id: companion.microchip })}
						</p>
					{/if}
				</div>
			</div>
		</div>
	</Card>

	<!-- Latest weight (read-only) -->
	{#if latestWeight}
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				{t(locale, 'page.dashboard.caretaker.labelWeight')}
			</h3>
			<p class="text-2xl font-bold text-foreground">
				{latestWeight.weight}<span class="text-sm font-normal ml-1 text-muted-foreground"
					>{latestWeight.unit}</span
				>
			</p>
			<p class="text-xs text-muted-foreground mt-1">
				{t(locale, 'page.dashboard.caretaker.weightAsOf')}
				<LocalTime date={latestWeight.recordedAt} />
			</p>
		</div>
	{/if}

	<!-- Schedules -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		{#if companion.feedingSchedule}
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="font-semibold flex items-center gap-2">
						<span>🍖</span>
						{t(locale, 'page.dashboard.caretaker.cardFeeding')}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="prose prose-sm dark:prose-invert max-w-none">
						{@html renderMarkdown(companion.feedingSchedule)}
					</div>
				</CardContent>
			</Card>
		{/if}
		{#if companion.walkSchedule}
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="font-semibold flex items-center gap-2">
						<span>🦮</span>
						{t(locale, 'page.dashboard.caretaker.cardWalk')}
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="prose prose-sm dark:prose-invert max-w-none">
						{@html renderMarkdown(companion.walkSchedule)}
					</div>
				</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Medications -->
	{#if medications.length > 0}
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="font-semibold flex items-center gap-2">
					<span>💊</span>
					{t(locale, 'page.dashboard.caretaker.cardMedications')}
				</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				{#each medications as med (med.id)}
					<div class="flex gap-3 text-sm">
						<div class="flex-1">
							<p class="font-medium">{med.title}</p>
							{#if med.notes}<div
									class="prose prose-sm dark:prose-invert max-w-none mt-0.5 text-muted-foreground"
								>
									{@html renderMarkdown(med.notes)}
								</div>{/if}
						</div>
						{#if med.nextDueAt}
							<span class="text-xs shrink-0 text-primary">
								{t(locale, 'page.dashboard.caretaker.medicationNext')}
								<LocalTime date={med.nextDueAt} />
							</span>
						{/if}
					</div>
				{/each}
			</CardContent>
		</Card>
	{/if}

	<!-- Reminders (only visible when on shift) -->
	{#if data.isOnShift}
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="font-semibold flex items-center gap-2">
					<Bell class="h-4 w-4" />
					{t(locale, 'page.dashboard.caretaker.cardReminders')}
					{#if upcomingReminders.length > 0}
						<Badge variant="secondary" class="ml-auto">{upcomingReminders.length}</Badge>
					{/if}
				</CardTitle>
			</CardHeader>
			<CardContent class="pt-0">
				{#if upcomingReminders.length === 0}
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'page.dashboard.caretaker.remindersEmpty')}
					</p>
				{:else}
					<div class="space-y-1">
						{#each upcomingReminders as reminder (reminder.id)}
							{@const isOverdue = new Date(reminder.dueAt) < new Date()}
							{@const isPending = pendingDismiss.isPending(reminder.id)}
							<div
								class="relative flex items-center gap-2 overflow-hidden rounded-lg {isPending
									? 'bg-muted/40'
									: ''}"
							>
								<button
									type="button"
									onclick={() => !isPending && openReminderDetail(reminder)}
									disabled={isPending}
									aria-disabled={isPending}
									class="flex-1 flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 hover:bg-accent transition-colors text-left min-w-0 disabled:hover:bg-transparent"
								>
									<span
										class="truncate {isPending
											? 'line-through text-muted-foreground'
											: 'text-foreground'}">{reminder.title}</span
									>
									{#if isOverdue}
										<Badge
											variant="destructive"
											class="shrink-0 text-xs {isPending ? 'opacity-50' : ''}"
											>{t(locale, 'page.dashboard.caretaker.reminderOverdue')}</Badge
										>
									{/if}
									<span
										class="ml-auto shrink-0 text-xs {isOverdue && !isPending
											? 'text-destructive'
											: 'text-muted-foreground'}"
									>
										<LocalTime date={reminder.dueAt} format="datetime" />
									</span>
								</button>
								<form
									method="POST"
									action="?/complete"
									use:enhance
									use:registerDismissForm={{
										id: reminder.id,
										registry: dismissFormRegistry
									}}
								>
									<input type="hidden" name="id" value={reminder.id} />
									{#if isPending}
										<div class="flex items-center gap-1 shrink-0">
											<button
												type="button"
												onclick={() => pendingDismiss.undo(reminder.id, reminder.title)}
												title={t(locale, 'common.reminder.undo')}
												aria-label={t(locale, 'common.reminder.undo')}
												class="inline-flex items-center gap-1 justify-center rounded-md h-9 px-3 text-sm font-medium border border-input bg-background transition-colors hover:bg-accent text-primary"
												onmouseenter={() => pendingDismiss.pause(reminder.id)}
												onmouseleave={() => pendingDismiss.resume(reminder.id)}
												onfocusin={() => pendingDismiss.pause(reminder.id)}
												onfocusout={() => pendingDismiss.resume(reminder.id)}
											>
												<Undo2 class="h-3.5 w-3.5" />
												<span class="hidden sm:inline">{t(locale, 'common.reminder.undo')}</span>
											</button>
											<button
												type="button"
												onclick={() => pendingDismiss.commitNow(reminder.id)}
												title={t(locale, 'common.reminder.dismissNow')}
												aria-label={t(locale, 'common.reminder.dismissNow')}
												class="inline-flex items-center gap-1 justify-center rounded-md h-9 px-3 text-sm font-medium border border-input bg-background transition-colors hover:bg-accent"
											>
												<CheckCheck class="h-3.5 w-3.5" />
												<span class="hidden sm:inline"
													>{t(locale, 'common.reminder.dismissNow')}</span
												>
											</button>
										</div>
									{:else}
										<button
											type="button"
											onclick={(e: MouseEvent) => {
												const btn = e.currentTarget as HTMLButtonElement;
												if (btn.form) {
													pendingDismiss.queue(reminder.id, btn.form, reminder.title);
												}
											}}
											class="inline-flex items-center gap-1 justify-center rounded-md h-9 px-3 text-sm font-medium border border-input bg-background transition-colors hover:bg-accent shrink-0"
										>
											<CheckCheck class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">{t(locale, 'common.reminder.done')}</span>
										</button>
									{/if}
								</form>
								{#if isPending}
									<span
										class="dismiss-countdown absolute bottom-0 left-0 h-0.5 bg-primary/70"
										style="--dismiss-ms: {undoDelayMs}ms"
										aria-hidden="true"
									></span>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	<!-- Contacts -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		{#if companion.vetName || companion.vetClinic || companion.vetPhone}
			<Card>
				<CardHeader class="pb-3">
					<CardTitle class="font-semibold flex items-center gap-2">
						<span>🏥</span>
						{t(locale, 'page.dashboard.caretaker.cardVetInfo')}
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-1 text-sm">
					{#if companion.vetName}<p class="font-medium">{companion.vetName}</p>{/if}
					{#if companion.vetClinic}<p class="text-muted-foreground">{companion.vetClinic}</p>{/if}
					{#if companion.vetPhone}
						📞 <a href="tel:{companion.vetPhone}" class="hover:underline font-medium text-primary"
							>{companion.vetPhone}</a
						>
					{/if}
				</CardContent>
			</Card>
		{/if}
		{#if companion.emergencyContactName || companion.emergencyContactPhone}
			<Card class="border-destructive/30">
				<CardHeader class="pb-3 bg-destructive/5 dark:bg-destructive/10 rounded-t-lg">
					<CardTitle class="font-semibold flex items-center gap-2">
						<span>🚨</span>
						{t(locale, 'page.dashboard.caretaker.cardEmergencyContact')}
					</CardTitle>
				</CardHeader>
				<CardContent class="space-y-1 text-sm">
					{#if companion.emergencyContactName}
						<p class="font-medium">{companion.emergencyContactName}</p>
					{/if}
					{#if companion.emergencyContactPhone}
						📞 <a
							href="tel:{companion.emergencyContactPhone}"
							class="text-red-600 dark:text-red-400 hover:underline font-medium text-base"
							>{companion.emergencyContactPhone}</a
						>
					{/if}
				</CardContent>
			</Card>
		{/if}
	</div>

	<!-- Household contacts -->
	{#if visibleOwners.length > 0}
		<div class="rounded-lg border border-border bg-card p-4 space-y-3">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				{visibleOwners.length === 1
					? t(locale, 'page.dashboard.caretaker.householdOwner')
					: t(locale, 'page.dashboard.caretaker.householdContacts')}
			</h3>
			{#each visibleOwners as owner (owner.id)}
				<div class="space-y-1">
					<p class="font-semibold text-foreground">{owner.displayName}</p>
					{#if owner.phone}
						<a
							href="tel:{owner.phone}"
							class="flex items-center gap-2 text-sm text-primary hover:underline"
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

	<!-- Sitter notes -->
	{#if companion.notesForSitter}
		<Card>
			<CardHeader class="pb-3">
				<CardTitle class="font-semibold flex items-center gap-2">
					<span>📌</span>
					{t(locale, 'page.dashboard.caretaker.cardSitterNotes')}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="prose prose-sm dark:prose-invert max-w-none">
					{@html renderMarkdown(companion.notesForSitter)}
				</div>
			</CardContent>
		</Card>
	{/if}

	<!-- About companion (bio) -->
	{#if companion.bio?.trim()}
		<div class="rounded-lg border border-border bg-card p-4">
			<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				{t(locale, 'page.dashboard.caretaker.cardAbout', { name: companion.name })}
			</h3>
			<div class="prose prose-sm dark:prose-invert max-w-none">
				{@html renderMarkdown(companion.bio)}
			</div>
		</div>
	{/if}

	<!-- aria-live announcements for reminder dismissals -->
	<div class="sr-only" role="status" aria-live="polite">{pendingDismiss.announcement}</div>

	<!-- Today's activity (only visible when on shift) -->
	{#if data.isOnShift}
		<Card>
			<CardHeader class="pb-3 flex flex-row items-center justify-between">
				<CardTitle class="font-semibold flex items-center gap-2">
					<span>📋</span>
					{t(locale, 'page.dashboard.caretaker.cardTodayActivity')}
				</CardTitle>
				<a href="/care/{companion.id}/log" class="text-primary text-xs hover:underline"
					>{t(locale, 'page.dashboard.caretaker.logActivity')}</a
				>
			</CardHeader>
			<CardContent>
				{#if todayActivity.length === 0}
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'page.dashboard.caretaker.activityEmpty')}
					</p>
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
											>{event.notes.replace(/[#*_`~>[\]]/g, '').trim()}</span
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
			</CardContent>
		</Card>
	{/if}
</div>
