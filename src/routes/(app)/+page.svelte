<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { CheckCheck, Pencil, Plus, Undo2 } from '@lucide/svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import {
		ACTIVITY_ICONS,
		MOOD_ICONS,
		REMINDER_ICONS,
		activityLabel,
		healthTypeLabel
	} from '$lib/i18n/labels';
	import { localDateISO } from '$lib/date';
	import { createPendingDismissals } from '$lib/pendingDismiss.svelte';
	import { registerDismissForm } from '$lib/actions/registerDismissForm';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();

	let companionsById = $derived(Object.fromEntries(data.companions.map((c) => [c.id, c])));

	type Reminder = (typeof data.upcomingReminders)[number];
	let remindersByDay = $derived.by(() => {
		const out: Record<string, Reminder[]> = {};
		for (const r of data.upcomingReminders) {
			const day = localDateISO(new Date(r.dueAt));
			(out[day] ??= []).push(r);
		}
		return out;
	});
	let reminderDays = $derived(Object.keys(remindersByDay).sort());

	type DailyEvent = (typeof data.recentDaily)[number];
	type HealthEvent = (typeof data.recentHealth)[number];
	type MergedEvent =
		| { kind: 'daily'; row: DailyEvent; at: Date }
		| { kind: 'health'; row: HealthEvent; at: Date };

	let recentTimeline = $derived.by<MergedEvent[]>(() => {
		const merged: MergedEvent[] = [
			...data.recentDaily.map((d) => ({
				kind: 'daily' as const,
				row: d,
				at: new Date(d.loggedAt)
			})),
			...data.recentHealth.map((h) => ({
				kind: 'health' as const,
				row: h,
				at: new Date(h.occurredAt)
			}))
		];
		merged.sort((a, b) => b.at.getTime() - a.at.getTime());
		return merged.slice(0, 20);
	});

	let undoDelayMs = $derived((data.reminderUndoSeconds ?? 0) * 1000);
	const pendingDismiss = createPendingDismissals(
		() => locale,
		() => undoDelayMs
	);
	const dismissFormRegistry = new Map<string, HTMLFormElement>();
	$effect(() => () => pendingDismiss.cleanup());

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			pendingDismiss.undoLast((id) => data.upcomingReminders.find((r) => r.id === id)?.title);
		}
	}

	function formatDayHeading(iso: string): string {
		const today = localDateISO(new Date());
		const tomorrow = localDateISO(new Date(Date.now() + 86400000));
		if (iso === today) return t(locale, 'overview.day.today');
		if (iso === tomorrow) return t(locale, 'overview.day.tomorrow');
		const [y, m, d] = iso.split('-').map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(undefined, {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>{t(locale, 'overview.title')} | EinVault</title>
</svelte:head>

<svelte:window onkeydown={handleWindowKey} />

<div class="space-y-8 pb-20 md:pb-0">
	<h1 class="sr-only">{t(locale, 'overview.title')}</h1>

	<section class="space-y-3">
		<h2 class="font-display text-xl font-bold text-foreground">
			{t(locale, 'overview.heading.reminders')}
		</h2>
		{#if reminderDays.length === 0}
			<Card>
				<CardContent class="text-center py-8">
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'overview.empty.reminders')}
					</p>
				</CardContent>
			</Card>
		{:else}
			<div class="space-y-4">
				{#each reminderDays as day (day)}
					<div class="space-y-2">
						<h3
							class="text-xs font-semibold uppercase tracking-wide text-muted-foreground sticky top-16 bg-background/95 backdrop-blur py-1 z-10"
						>
							{formatDayHeading(day)}
						</h3>
						<div class="space-y-2">
							{#each remindersByDay[day] as r (r.id)}
								{@const companion = companionsById[r.companionId]}
								{@const isPending = pendingDismiss.isPending(r.id)}
								<Card class="relative overflow-hidden {isPending ? 'bg-muted/40' : ''}">
									<CardContent class="py-3">
										<div class="flex items-start gap-3">
											{#if companion}
												<a href="/{companion.id}" aria-label={companion.name} class="shrink-0">
													<CompanionAvatar
														companionId={companion.id}
														avatarPath={companion.avatarPath}
														name={companion.name}
														size="sm"
													/>
												</a>
											{/if}
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-2 flex-wrap">
													<span class="text-base" aria-hidden="true"
														>{REMINDER_ICONS[r.type] ?? '📌'}</span
													>
													<span
														class="font-medium {isPending
															? 'line-through text-muted-foreground'
															: 'text-foreground'}"
													>
														{r.title}
													</span>
												</div>
												<p class="text-xs mt-0.5 text-muted-foreground">
													{companion?.name ?? ''} ·
													<LocalTime date={r.dueAt} format="time" />
												</p>
											</div>
											<form
												method="POST"
												action="?/complete"
												use:enhance
												use:registerDismissForm={{
													id: r.id,
													registry: dismissFormRegistry
												}}
												class="shrink-0"
											>
												<input type="hidden" name="id" value={r.id} />
												{#if isPending}
													<div class="flex items-center gap-1">
														<Button
															type="button"
															variant="ghost"
															size="sm"
															class="h-7 gap-1.5 px-2 text-xs text-primary"
															onclick={() => pendingDismiss.undo(r.id, r.title)}
															title={t(locale, 'common.reminder.undo')}
															aria-label={t(locale, 'common.reminder.undo')}
															onmouseenter={() => pendingDismiss.pause(r.id)}
															onmouseleave={() => pendingDismiss.resume(r.id)}
															onfocusin={() => pendingDismiss.pause(r.id)}
															onfocusout={() => pendingDismiss.resume(r.id)}
														>
															<Undo2 class="h-3.5 w-3.5" />
															<span class="hidden sm:inline"
																>{t(locale, 'common.reminder.undo')}</span
															>
														</Button>
														<Button
															type="button"
															variant="ghost"
															size="sm"
															class="h-7 gap-1.5 px-2 text-xs"
															onclick={() => pendingDismiss.commit(r.id, r.title)}
															title={t(locale, 'common.reminder.dismissNow')}
															aria-label={t(locale, 'common.reminder.dismissNow')}
														>
															<CheckCheck class="h-3.5 w-3.5" />
															<span class="hidden sm:inline"
																>{t(locale, 'common.reminder.dismissNow')}</span
															>
														</Button>
													</div>
												{:else}
													<Button
														type="button"
														variant="ghost"
														size="sm"
														class="h-7 gap-1.5 px-2 text-xs"
														aria-label={t(locale, 'overview.markDone')}
														onclick={() => {
															const form = dismissFormRegistry.get(r.id);
															if (form) pendingDismiss.queue(r.id, form, r.title);
														}}
													>
														<CheckCheck class="h-3.5 w-3.5" />
														<span class="hidden sm:inline">{t(locale, 'common.reminder.done')}</span
														>
													</Button>
												{/if}
											</form>
										</div>
									</CardContent>
									{#if isPending}
										<span
											class="dismiss-countdown absolute bottom-0 left-0 h-0.5 bg-primary/70"
											style="--dismiss-ms: {undoDelayMs}ms"
											aria-hidden="true"
										></span>
									{/if}
								</Card>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<Separator />

	<section class="space-y-3">
		<h2 class="font-display text-xl font-bold text-foreground">
			{t(locale, 'overview.heading.todayJournal')}
		</h2>
		<div class="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
			{#each data.companions as companion (companion.id)}
				{@const entry = data.todayJournalByCompanion[companion.id]}
				<Card>
					<CardContent class="py-4">
						<div class="flex items-center gap-2 mb-2">
							<CompanionAvatar
								companionId={companion.id}
								avatarPath={companion.avatarPath}
								name={companion.name}
								size="sm"
							/>
							<span class="font-medium text-sm text-foreground truncate">{companion.name}</span>
							{#if entry?.mood}
								<span class="text-base ml-auto" aria-hidden="true">{MOOD_ICONS[entry.mood]}</span>
							{/if}
						</div>
						{#if entry}
							{#if entry.body}
								<p class="text-sm text-muted-foreground line-clamp-3 mb-2 whitespace-pre-line">
									{entry.body}
								</p>
							{:else}
								<p class="text-xs italic text-muted-foreground mb-2">
									{t(locale, 'overview.empty.journal')}
								</p>
							{/if}
							<Button
								href="/{companion.id}/journal/{entry.date}"
								variant="ghost"
								size="sm"
								class="h-7 gap-1.5 px-2 text-xs"
							>
								<Pencil class="h-3.5 w-3.5" />
								{t(locale, 'overview.journal.editToday')}
							</Button>
						{:else}
							<p class="text-xs italic text-muted-foreground mb-2">
								{t(locale, 'overview.empty.journal')}
							</p>
							<Button
								href="/{companion.id}/journal/{localDateISO(new Date())}"
								variant="ghost"
								size="sm"
								class="h-7 gap-1.5 px-2 text-xs"
							>
								<Plus class="h-3.5 w-3.5" />
								{t(locale, 'overview.journal.addToday')}
							</Button>
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	</section>

	<Separator />

	<section class="space-y-3">
		<h2 class="font-display text-xl font-bold text-foreground">
			{t(locale, 'overview.heading.recentActivity')}
		</h2>
		{#if recentTimeline.length === 0}
			<Card>
				<CardContent class="text-center py-8">
					<p class="text-sm italic text-muted-foreground">
						{t(locale, 'overview.empty.recent')}
					</p>
				</CardContent>
			</Card>
		{:else}
			<div class="space-y-2">
				{#each recentTimeline as event (event.kind + ':' + event.row.id)}
					{@const companion = companionsById[event.row.companionId]}
					<Card>
						<CardContent class="py-3">
							<div class="flex items-start gap-3">
								{#if companion}
									<a href="/{companion.id}" aria-label={companion.name} class="shrink-0">
										<CompanionAvatar
											companionId={companion.id}
											avatarPath={companion.avatarPath}
											name={companion.name}
											size="sm"
										/>
									</a>
								{/if}
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 flex-wrap">
										{#if event.kind === 'daily'}
											<span class="text-base" aria-hidden="true"
												>{ACTIVITY_ICONS[event.row.type] ?? '📝'}</span
											>
											<span class="font-medium text-sm text-foreground"
												>{activityLabel(locale, event.row.type)}</span
											>
											{#if event.row.durationMinutes}
												<Badge variant="secondary">{event.row.durationMinutes}m</Badge>
											{/if}
										{:else}
											<span class="text-base" aria-hidden="true">🏥</span>
											<span class="font-medium text-sm text-foreground truncate"
												>{event.row.title}</span
											>
											<Badge variant="secondary">{healthTypeLabel(locale, event.row.type)}</Badge>
										{/if}
									</div>
									{#if event.kind === 'daily' && event.row.notes}
										<p class="text-xs mt-0.5 text-muted-foreground line-clamp-2">
											{event.row.notes}
										</p>
									{/if}
									<p class="text-xs mt-0.5 text-muted-foreground">
										{companion?.name ?? ''} ·
										<LocalTime date={event.at} format="datetime" /><ByLine
											user={event.row.logger}
											variant="inline"
										/>
									</p>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		{/if}
	</section>
</div>

<div class="sr-only" role="status" aria-live="polite">{pendingDismiss.announcement}</div>

<style>
	.dismiss-countdown {
		animation: dismiss-shrink var(--dismiss-ms) linear forwards;
	}
	@keyframes dismiss-shrink {
		from {
			width: 100%;
		}
		to {
			width: 0;
		}
	}
</style>
