<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Plus, Zap, ChevronRight } from '@lucide/svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { localDateISO } from '$lib/date';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';
	import { clearSubmittingFlag } from '$lib/clearSubmittingFlag';
	import { ACTIVITY_ICONS, REMINDER_ICONS } from '$lib/i18n/labels';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

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

	// Last daily event per companion
	let lastActivityByCompanion = $derived.by(() => {
		const out: Record<string, (typeof data.recentDaily)[number]> = {};
		for (const e of data.recentDaily) {
			if (!out[e.companionId]) out[e.companionId] = e;
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

	let undoDelayMs = $derived((data.reminderUndoSeconds ?? 0) * 1000);
	const pendingDismiss = createPendingDismissals(
		() => locale,
		() => undoDelayMs
	);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();
	$effect(() => () => pendingDismiss.cleanup());
</script>

<svelte:head>
	<title>{t(locale, 'overview.title')} | EinVault</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	<h1 class="sr-only">{t(locale, 'overview.title')}</h1>

	<!-- Greeting header -->
	<div class="flex items-start justify-between gap-3">
		<div>
			<p class="font-display text-2xl font-bold text-foreground">
				{t(locale, 'overview.greeting', { name: data.user.displayName })}
			</p>
			<p class="text-sm text-muted-foreground mt-0.5">
				<LocalTime date={new Date()} format="date" /> &middot;
				{data.companions.length}
				{data.companions.length === 1 ? 'companion' : 'companions'}
			</p>
		</div>
		<Button href="/companions/new" size="sm" class="shrink-0 gap-1.5">
			<Plus class="h-4 w-4" />
			<span class="hidden sm:inline">{t(locale, 'layout.addCompanion')}</span>
			<span class="sm:hidden">Add</span>
		</Button>
	</div>

	<!-- Needs-attention strip -->
	{#if attentionItems.length > 0}
		<section aria-label={t(locale, 'overview.needsAttention')}>
			<div class="flex items-center gap-1.5 mb-2">
				<Zap class="h-3.5 w-3.5 text-coral" />
				<h2 class="text-sm font-semibold text-coral">
					{t(locale, 'overview.needsAttention')}
				</h2>
			</div>
			<div class="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
				{#each attentionItems as { r, urgency } (r.id)}
					{@const companion = companionsById[r.companionId]}
					<a
						href={companion ? `/${companion.id}/reminders` : '/'}
						class="flex-none min-w-[140px] rounded-xl border bg-card p-3 hover:border-coral/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					>
						<p class="text-xs font-semibold text-foreground truncate">
							{companion?.name ?? ''} &middot; {r.title}
						</p>
						<Badge
							variant={urgency === 'overdue' ? 'coral' : urgency === 'today' ? 'gold' : 'teal'}
							class="mt-1.5 text-[10px]"
						>
							{urgencyLabel(urgency)}
						</Badge>
					</a>
				{/each}
			</div>

			<!-- Quick-dismiss forms (hidden, needed for pendingDismiss) -->
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

		<Separator />
	{/if}

	<!-- Companions grid -->
	<section>
		<div class="flex items-center justify-between mb-3">
			<h2 class="font-display text-lg font-bold text-foreground">
				{t(locale, 'overview.heading.companions')}
			</h2>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
			{#each data.companions as companion (companion.id)}
				{@const lastActivity = lastActivityByCompanion[companion.id]}
				{@const nextReminder = nextReminderByCompanion[companion.id]}
				{@const age = companionAge(companion.dob)}
				{@const urgency = nextReminder ? reminderUrgency(nextReminder.dueAt) : null}

				<a
					href="/{companion.id}"
					class="group block rounded-xl border bg-card p-4 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<!-- Avatar + name -->
					<div class="flex items-center gap-3 mb-3">
						<CompanionAvatar
							companionId={companion.id}
							avatarPath={companion.avatarPath}
							name={companion.name}
							size="md"
						/>
						<div class="min-w-0">
							<p class="font-semibold text-foreground truncate">{companion.name}</p>
							{#if companion.breed || age}
								<p class="text-xs text-muted-foreground truncate">
									{[companion.breed, age].filter(Boolean).join(' · ')}
								</p>
							{/if}
						</div>
						<ChevronRight
							class="h-4 w-4 text-muted-foreground ml-auto shrink-0 group-hover:text-foreground transition-colors"
						/>
					</div>

					<!-- Last activity -->
					{#if lastActivity}
						<div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
							<span aria-hidden="true" class="text-sm"
								>{ACTIVITY_ICONS[lastActivity.type] ?? '📝'}</span
							>
							<span class="truncate">{lastActivity.type}</span>
							<span class="ml-auto shrink-0 tabular-nums"
								><LocalTime date={lastActivity.loggedAt} format="relative" /></span
							>
						</div>
					{/if}

					<!-- Next reminder -->
					{#if nextReminder}
						<div
							class="flex items-center gap-2 pt-2.5 border-t border-border text-xs text-muted-foreground"
						>
							<span aria-hidden="true" class="text-sm"
								>{REMINDER_ICONS[nextReminder.type] ?? '📌'}</span
							>
							<span class="truncate">{nextReminder.title}</span>
							{#if urgency}
								<Badge
									variant={urgency === 'overdue' ? 'coral' : urgency === 'today' ? 'gold' : 'teal'}
									class="ml-auto shrink-0 text-[10px] py-0 px-1.5"
								>
									{urgencyLabel(urgency)}
								</Badge>
							{/if}
						</div>
					{/if}
				</a>
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
</div>
