<script lang="ts">
	import type { PageData } from './$types';
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Plus, Zap, Check, Pencil, Bell, X } from '@lucide/svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { renderMarkdown } from '$lib/markdown';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { localDateISO } from '$lib/date';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';
	import { clearSubmittingFlag } from '$lib/clearSubmittingFlag';
	import {
		ACTIVITY_ICONS,
		REMINDER_ICONS,
		MOOD_ICONS,
		activityLabel,
		healthTypeLabel
	} from '$lib/i18n/labels';
	import { careStatus } from '$lib/careStatus';
	import { REMINDER_TO_HEALTH_TYPE } from '$lib/health';
	import ReminderCompleteButtons from '$lib/components/reminders/ReminderCompleteButtons.svelte';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

	// Use the server's notion of today so journal links don't drift on timezone boundary.
	// The (app) layout server returns `today: localDateISO()` which SvelteKit merges into data.
	let today = $derived(data.today);

	// Health type → emoji icon (no dedicated icon map exists; define inline)
	const HEALTH_ICONS: Record<string, string> = {
		vet_visit: '🏥',
		vaccination: '💉',
		medication: '💊',
		procedure: '🩺',
		other: '❤️'
	};

	// Urgency classification for reminders
	type Urgency = 'overdue' | 'today' | 'upcoming';

	function reminderUrgency(dueAt: Date | string | number): Urgency {
		const now = new Date();
		const due = new Date(dueAt);
		const todayISO = localDateISO(now);
		const dueISO = localDateISO(due);
		if (due < now) return 'overdue';
		if (dueISO === todayISO) return 'today';
		return 'upcoming';
	}

	type Reminder = (typeof data.upcomingReminders)[number];

	// Needs-attention: overdue + today reminders, sorted overdue first
	let attentionItems = $derived.by(() => {
		return data.upcomingReminders
			.map((r) => ({ r, urgency: reminderUrgency(r.dueAt) }))
			.filter(({ urgency }) => urgency === 'overdue' || urgency === 'today')
			.sort((a, b) => {
				if (a.urgency === 'overdue' && b.urgency !== 'overdue') return -1;
				if (b.urgency === 'overdue' && a.urgency !== 'overdue') return 1;
				return new Date(a.r.dueAt).getTime() - new Date(b.r.dueAt).getTime();
			});
	});

	// Per-companion maps for quick lookup
	let companionsById = $derived(Object.fromEntries(data.companions.map((c) => [c.id, c])));

	// Per-companion reminders for careStatus
	let remindersByCompanion = $derived.by(() => {
		const out: Record<string, Reminder[]> = {};
		for (const r of data.upcomingReminders) {
			if (!out[r.companionId]) out[r.companionId] = [];
			out[r.companionId].push(r);
		}
		return out;
	});

	// Next reminder per companion (first upcoming, incl. overdue)
	let nextReminderByCompanion = $derived.by(() => {
		const out: Record<string, Reminder> = {};
		for (const r of data.upcomingReminders) {
			if (!out[r.companionId]) out[r.companionId] = r;
		}
		return out;
	});

	// Last activity per companion: most recent of daily + health
	let lastActivityByCompanion = $derived.by(() => {
		const out: Record<
			string,
			| { kind: 'daily'; item: (typeof data.recentDaily)[number] }
			| { kind: 'health'; item: (typeof data.recentHealth)[number] }
		> = {};
		for (const e of data.recentDaily) {
			const cur = out[e.companionId];
			if (
				!cur ||
				new Date(e.loggedAt) >
					new Date(cur.kind === 'daily' ? cur.item.loggedAt : cur.item.occurredAt)
			) {
				out[e.companionId] = { kind: 'daily', item: e };
			}
		}
		for (const h of data.recentHealth) {
			const cur = out[h.companionId];
			if (
				!cur ||
				new Date(h.occurredAt) >
					new Date(cur.kind === 'daily' ? cur.item.loggedAt : cur.item.occurredAt)
			) {
				out[h.companionId] = { kind: 'health', item: h };
			}
		}
		return out;
	});

	// Recent household feed: merge daily + health, sort desc, cap 8
	let householdFeed = $derived.by(() => {
		type FeedItem =
			| { kind: 'daily'; item: (typeof data.recentDaily)[number]; ts: Date }
			| { kind: 'health'; item: (typeof data.recentHealth)[number]; ts: Date };
		const items: FeedItem[] = [
			...data.recentDaily.map((item) => ({
				kind: 'daily' as const,
				item,
				ts: new Date(item.loggedAt)
			})),
			...data.recentHealth.map((item) => ({
				kind: 'health' as const,
				item,
				ts: new Date(item.occurredAt)
			}))
		];
		items.sort((a, b) => b.ts.getTime() - a.ts.getTime());
		return items.slice(0, 8);
	});

	// Age from DOB string "YYYY-MM-DD"
	function companionAge(dob: string | null | undefined): string | null {
		if (!dob) return null;
		const [y, m, d] = dob.split('-').map(Number);
		const born = new Date(y, m - 1, d);
		const now = new Date();
		const years = now.getFullYear() - born.getFullYear();
		const adjusted =
			now < new Date(now.getFullYear(), born.getMonth(), born.getDate()) ? years - 1 : years;
		if (adjusted < 1) {
			const months = Math.floor((now.getTime() - born.getTime()) / (30 * 24 * 60 * 60 * 1000));
			return `${months}mo`;
		}
		return `${adjusted}y`;
	}

	function urgencyLabel(urgency: Urgency): string {
		if (urgency === 'overdue') return t(locale, 'page.dashboard.caretaker.reminderOverdue');
		if (urgency === 'today') return t(locale, 'overview.day.today');
		return t(locale, 'overview.day.tomorrow');
	}

	function companionCountLabel(count: number): string {
		return count === 1
			? t(locale, 'overview.companionCount.one', { count })
			: t(locale, 'overview.companionCount.other', { count });
	}

	let undoDelayMs = $derived((data.reminderUndoSeconds ?? 0) * 1000);
	const pendingDismiss = createPendingDismissals(
		() => locale,
		() => undoDelayMs
	);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();
	$effect(() => () => pendingDismiss.cleanup());

	function handleComplete(reminderId: string, title: string, reminderType: string) {
		const form = dismissFormRegistry.get(reminderId);
		if (!form) return;
		const allowLogEvent =
			REMINDER_TO_HEALTH_TYPE[reminderType as keyof typeof REMINDER_TO_HEALTH_TYPE] !== null;
		pendingDismiss.queue(reminderId, form, title, { allowLogEvent });
	}

	function submitWithAndEvent(reminderId: string) {
		const form = dismissFormRegistry.get(reminderId);
		if (!form) {
			console.warn('Reminder dismiss form not found for', reminderId);
			return;
		}
		pendingDismiss.commitWithEvent(reminderId, form);
	}

	// Detail modal
	type AttentionReminder = (typeof data.upcomingReminders)[number];
	let detailReminder = $state<AttentionReminder | null>(null);
	let detailDialogEl = $state<HTMLElement | null>(null);

	async function openReminderDetail(r: AttentionReminder) {
		detailReminder = r;
		await tick();
		detailDialogEl?.focus();
	}

	function closeReminderDetail() {
		detailReminder = null;
	}

	function handleOverviewWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && detailReminder) {
			closeReminderDetail();
		}
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
		if (e.key === 'Escape') closeReminderDetail();
	}
</script>

<svelte:head>
	<title>{t(locale, 'overview.title')} | EinVault</title>
</svelte:head>

<svelte:window onkeydown={handleOverviewWindowKey} />

<!-- Reminder detail modal -->
{#if detailReminder}
	{@const r = detailReminder}
	{@const companion = companionsById[r.companionId]}
	{@const overdue = new Date(r.dueAt) < new Date()}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'aria.closeDialog')}
			onclick={closeReminderDetail}
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
				<h2 class="font-semibold text-base text-foreground">{r.title}</h2>
				<button
					onclick={closeReminderDetail}
					aria-label={t(locale, 'aria.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				{#if companion}
					<div class="flex items-center gap-3">
						<CompanionAvatar
							companionId={companion.id}
							avatarPath={companion.avatarPath}
							name={companion.name}
							size="sm"
						/>
						<span class="font-medium text-foreground">{companion.name}</span>
					</div>
				{/if}
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.reminders.detailType')}</span
					>
					<Badge variant="secondary" class="capitalize">{r.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.reminders.detailDue')}</span
					>
					<span class={overdue ? 'text-coral' : 'text-foreground'}>
						<LocalTime date={r.dueAt} format="datetime" />
					</span>
					{#if overdue}
						<Badge variant="coral" class="ml-1">{t(locale, 'page.reminders.overdue')}</Badge>
					{/if}
				</div>
				{#if r.description}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.reminders.detailNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(r.description)}
						</div>
					</div>
				{/if}
			</div>

			<Separator />

			<div class="flex gap-2 px-5 py-4">
				{#if companion}
					<Button
						variant="outline"
						size="sm"
						href="/{companion.id}/reminders"
						onclick={closeReminderDetail}
					>
						{t(locale, 'overview.reminders.openFor', { name: companion.name })}
					</Button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<div class="space-y-6 pb-20 md:pb-0">
	<h1 class="sr-only">{t(locale, 'overview.title')}</h1>

	<!-- 1. Greeting header -->
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-display text-2xl font-bold text-foreground">
				{t(locale, 'overview.greeting', { name: data.user.displayName })}
			</p>
			<p class="text-sm text-muted-foreground mt-0.5">
				<LocalTime date={new Date()} format="date" /> &middot;
				{companionCountLabel(data.companions.length)}
			</p>
		</div>
		<Button href="/companions/new" size="sm" class="shrink-0 gap-1.5">
			<Plus class="h-4 w-4" />
			<span class="hidden sm:inline">{t(locale, 'layout.addCompanion')}</span>
			<span class="sm:hidden">Add</span>
		</Button>
	</div>

	<!-- 2. Needs-attention banner -->
	{#if attentionItems.length > 0}
		<section
			aria-label={t(locale, 'overview.needsAttention')}
			class="rounded-xl border bg-gradient-to-br from-coral/10 to-primary/5 p-3 space-y-1"
		>
			<div class="flex items-center gap-1.5 mb-2">
				<Zap class="h-3.5 w-3.5 text-coral shrink-0" />
				<h2 class="text-xs font-bold text-coral uppercase tracking-wide">
					{t(locale, 'overview.needsAttention')}
				</h2>
			</div>
			{#each attentionItems as { r, urgency } (r.id)}
				{@const companion = companionsById[r.companionId]}
				<div
					class="flex items-center gap-2 py-1.5 border-t border-border/40 first-of-type:border-t-0"
				>
					{#if companion}
						<a
							href="/{companion.id}"
							onclick={(e) => e.stopPropagation()}
							class="shrink-0"
							tabindex="-1"
							aria-hidden="true"
						>
							<CompanionAvatar
								companionId={companion.id}
								avatarPath={companion.avatarPath}
								name={companion.name}
								size="sm"
							/>
						</a>
					{/if}
					<button
						type="button"
						onclick={() => openReminderDetail(r)}
						class="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
					>
						{#if companion}
							<span class="text-sm font-semibold text-foreground shrink-0">{companion.name}</span>
						{/if}
						<span class="text-sm text-muted-foreground truncate">{r.title}</span>
						<Badge
							variant={urgency === 'overdue' ? 'coral' : 'gold'}
							class="shrink-0 text-[10px] py-0 px-1.5"
						>
							{urgencyLabel(urgency)}
						</Badge>
					</button>
					<!-- Complete / log-event buttons — stopPropagation keeps them from triggering the modal -->
					<div onclick={(e) => e.stopPropagation()} role="none">
						<ReminderCompleteButtons
							onDone={() => handleComplete(r.id, r.title, r.type)}
							onDoneAndLog={() => submitWithAndEvent(r.id)}
							allowLogEvent={REMINDER_TO_HEALTH_TYPE[
								r.type as keyof typeof REMINDER_TO_HEALTH_TYPE
							] !== null}
						/>
					</div>
				</div>
			{/each}

			<!-- Hidden dismiss forms -->
			{#each attentionItems as { r } (r.id + '-form')}
				<form
					method="POST"
					action="?/complete"
					use:enhance={clearSubmittingFlag}
					use:registerDismissForm={{ id: r.id, registry: dismissFormRegistry }}
					class="hidden"
				>
					<input type="hidden" name="id" value={r.id} />
				</form>
			{/each}
		</section>
	{:else}
		<p class="text-sm text-muted-foreground flex items-center gap-1.5">
			<Check class="h-4 w-4 text-teal" />
			{t(locale, 'overview.allCaughtUp')}
		</p>
	{/if}

	<!-- 3. Your companions -->
	<section>
		<h2 class="font-display text-lg font-bold text-foreground mb-3">
			{t(locale, 'overview.heading.companions')}
		</h2>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each data.companions as companion (companion.id)}
				{@const age = companionAge(companion.dob)}
				{@const compReminders = remindersByCompanion[companion.id] ?? []}
				{@const status = careStatus(
					compReminders.map((r) => ({
						dueAt: new Date(r.dueAt),
						completedAt: r.completedAt ? new Date(r.completedAt) : null
					}))
				)}
				{@const nextReminder = nextReminderByCompanion[companion.id]}
				{@const nextUrgency = nextReminder ? reminderUrgency(nextReminder.dueAt) : null}
				{@const journalEntry = data.todayJournalByCompanion[companion.id]}
				{@const lastActivity = lastActivityByCompanion[companion.id]}

				<div
					role="link"
					tabindex="0"
					onclick={() => {
						window.location.href = `/${companion.id}`;
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							window.location.href = `/${companion.id}`;
						}
					}}
					class="group block rounded-xl border bg-card p-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
				>
					<!-- Card header: avatar + name + care status badge -->
					<div class="flex items-center gap-3 mb-3">
						<CompanionAvatar
							companionId={companion.id}
							avatarPath={companion.avatarPath}
							name={companion.name}
							size="md"
						/>
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-foreground truncate">{companion.name}</p>
							{#if companion.breed || age}
								<p class="text-xs text-muted-foreground truncate">
									{[companion.breed, age].filter(Boolean).join(' · ')}
								</p>
							{/if}
						</div>
						{#if status === 'up-to-date'}
							<Badge variant="teal" class="shrink-0 text-[10px] py-0 px-1.5">
								{t(locale, 'overview.careStatus.upToDate')}
							</Badge>
						{:else if status === 'due-today'}
							<Badge variant="gold" class="shrink-0 text-[10px] py-0 px-1.5">
								{t(locale, 'overview.careStatus.dueToday')}
							</Badge>
						{:else}
							<Badge variant="coral" class="shrink-0 text-[10px] py-0 px-1.5">
								{t(locale, 'overview.careStatus.needsAttention')}
							</Badge>
						{/if}
					</div>

					<!-- Today's journal line -->
					<div class="flex items-center gap-2 pt-2.5 pb-2.5 border-t border-border text-xs">
						<span
							class="shrink-0 h-6 w-6 rounded-lg {journalEntry
								? 'bg-primary/15 text-primary'
								: 'bg-muted text-muted-foreground'} flex items-center justify-center"
							aria-hidden="true"
						>
							<Pencil class="h-3 w-3" />
						</span>
						{#if journalEntry}
							<span class="text-foreground truncate flex-1">
								{#if journalEntry.mood}
									<span aria-hidden="true">{MOOD_ICONS[journalEntry.mood] ?? ''} </span>
								{/if}
								{journalEntry.body
									? journalEntry.body.slice(0, 60) + (journalEntry.body.length > 60 ? '…' : '')
									: ''}
							</span>
						{:else}
							<span class="text-muted-foreground flex-1"
								>{t(locale, 'overview.journal.noEntryYet')}</span
							>
							<a
								href="/{companion.id}/journal/{today}"
								onclick={(e) => e.stopPropagation()}
								class="shrink-0 text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-md hover:bg-primary/20 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
							>
								{t(locale, 'overview.journal.addTodayShort')}
							</a>
						{/if}
					</div>

					<!-- Next reminder line -->
					<div class="flex items-center gap-2 pt-2.5 pb-2.5 border-t border-border text-xs">
						<span
							class="shrink-0 h-6 w-6 rounded-lg {nextReminder
								? nextUrgency === 'overdue'
									? 'bg-coral/15 text-coral'
									: nextUrgency === 'today'
										? 'bg-gold/15 text-gold'
										: 'bg-teal/15 text-teal'
								: 'bg-muted text-muted-foreground'} flex items-center justify-center text-sm"
							aria-hidden="true"
						>
							{#if nextReminder}
								{REMINDER_ICONS[nextReminder.type] ?? '📌'}
							{:else}
								<Bell class="h-3 w-3" />
							{/if}
						</span>
						{#if nextReminder}
							<span class="text-foreground truncate flex-1">{nextReminder.title}</span>
							{#if nextUrgency}
								<Badge
									variant={nextUrgency === 'overdue'
										? 'coral'
										: nextUrgency === 'today'
											? 'gold'
											: 'teal'}
									class="shrink-0 text-[10px] py-0 px-1.5"
								>
									{urgencyLabel(nextUrgency)}
								</Badge>
							{/if}
						{:else}
							<span class="text-muted-foreground">{t(locale, 'overview.reminders.none')}</span>
						{/if}
					</div>

					<!-- Last activity line -->
					{#if lastActivity}
						<div
							class="flex items-center gap-2 pt-2.5 pb-2.5 border-t border-border text-xs text-muted-foreground"
						>
							<span
								class="shrink-0 h-6 w-6 rounded-lg bg-teal/10 text-teal flex items-center justify-center text-sm"
								aria-hidden="true"
							>
								{#if lastActivity.kind === 'daily'}
									{ACTIVITY_ICONS[lastActivity.item.type] ?? '📝'}
								{:else}
									{HEALTH_ICONS[lastActivity.item.type] ?? '❤️'}
								{/if}
							</span>
							<span class="truncate flex-1">
								{#if lastActivity.kind === 'daily'}
									{activityLabel(locale, lastActivity.item.type)}
								{:else}
									{lastActivity.item.title}
								{/if}
								{#if lastActivity.kind === 'daily' && lastActivity.item.logger}
									&middot; {lastActivity.item.logger.displayName}
								{/if}
							</span>
							<span class="shrink-0 tabular-nums">
								<LocalTime
									date={lastActivity.kind === 'daily'
										? lastActivity.item.loggedAt
										: lastActivity.item.occurredAt}
									format="relative"
								/>
							</span>
						</div>
					{/if}
				</div>
			{/each}

			<!-- Add companion card -->
			<a
				href="/companions/new"
				class="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border min-h-[130px] text-muted-foreground hover:border-primary hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring p-4"
			>
				<div class="rounded-xl bg-primary/10 p-2.5">
					<Plus class="h-5 w-5 text-primary" />
				</div>
				<p class="text-sm font-medium">{t(locale, 'layout.addCompanion')}</p>
				<p class="text-xs">{t(locale, 'overview.companions.addStart')}</p>
			</a>
		</div>
	</section>

	<!-- 4. Recent across the household -->
	{#if householdFeed.length > 0}
		<section>
			<div class="flex items-center gap-2 mb-3">
				<h2 class="font-display text-base font-bold text-foreground">
					{t(locale, 'overview.recentHousehold')}
				</h2>
				<span class="ml-auto text-xs text-muted-foreground">{t(locale, 'overview.last7Days')}</span>
			</div>
			<div class="rounded-xl border bg-card divide-y divide-border">
				{#each householdFeed as entry (entry.kind + ':' + entry.item.id)}
					{@const companion = companionsById[entry.item.companionId]}
					<div class="flex items-center gap-3 px-4 py-3 text-sm">
						<span
							class="shrink-0 h-7 w-7 rounded-lg {entry.kind === 'daily'
								? 'bg-teal/10 text-teal'
								: 'bg-coral/10 text-coral'} flex items-center justify-center text-sm"
							aria-hidden="true"
						>
							{#if entry.kind === 'daily'}
								{ACTIVITY_ICONS[entry.item.type] ?? '📝'}
							{:else}
								{HEALTH_ICONS[entry.item.type] ?? '❤️'}
							{/if}
						</span>
						<span class="flex-1 min-w-0 text-muted-foreground truncate">
							{#if entry.kind === 'daily'}
								{#if entry.item.logger}
									<span class="font-semibold text-foreground">{entry.item.logger.displayName}</span>
									&middot; {activityLabel(locale, entry.item.type)}
								{:else}
									{activityLabel(locale, entry.item.type)}
								{/if}
								{#if companion}
									&middot; <span class="font-semibold text-foreground">{companion.name}</span>
								{/if}
							{:else}
								<span class="font-semibold text-foreground"
									>{healthTypeLabel(locale, entry.item.type)}</span
								>
								{#if entry.item.title}
									&middot; {entry.item.title}
								{/if}
								{#if companion}
									&middot; <span class="font-semibold text-foreground">{companion.name}</span>
								{/if}
							{/if}
						</span>
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							<LocalTime
								date={entry.kind === 'daily' ? entry.item.loggedAt : entry.item.occurredAt}
								format="relative"
							/>
						</span>
					</div>
				{/each}
			</div>
		</section>
	{/if}
</div>
