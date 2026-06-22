<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { SvelteDate } from 'svelte/reactivity';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { CalendarClock, Settings } from '@lucide/svelte';
	import AccountCard from '$lib/components/settings/AccountCard.svelte';
	import LanguageCard from '$lib/components/settings/LanguageCard.svelte';
	import AppearanceCard from '$lib/components/settings/AppearanceCard.svelte';
	import CalendarFeedCard from '$lib/components/settings/CalendarFeedCard.svelte';
	import ReminderUndoCard from '$lib/components/settings/ReminderUndoCard.svelte';
	import NotificationsCard from '$lib/components/settings/NotificationsCard.svelte';
	import SecurityCard from '$lib/components/settings/SecurityCard.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { t, getLocale, type MessageKey } from '$lib/i18n';
	import type { Theme } from '$lib/theme';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const locale = getLocale();
	let expandedShiftId = $state<string | null>(null);

	const now = new SvelteDate();

	type Shift = (typeof data.upcomingShifts)[0];

	function shiftGroup(shift: Shift): 'active' | 'this-week' | 'next-week' | 'later' {
		if (shift.startAt <= now && shift.endAt >= now) return 'active';
		const msPerDay = 86_400_000;
		const startOfToday = new SvelteDate(now);
		startOfToday.setHours(0, 0, 0, 0);
		const dayOfWeek = startOfToday.getDay();
		const startOfWeek = new SvelteDate(startOfToday.getTime() - dayOfWeek * msPerDay);
		const endOfWeek = new SvelteDate(startOfWeek.getTime() + 7 * msPerDay);
		const endOfNextWeek = new SvelteDate(startOfWeek.getTime() + 14 * msPerDay);
		if (shift.startAt < endOfWeek) return 'this-week';
		if (shift.startAt < endOfNextWeek) return 'next-week';
		return 'later';
	}

	function shiftDuration(shift: Shift): string {
		const ms = shift.endAt.getTime() - shift.startAt.getTime();
		const days = ms / 86_400_000;
		if (days >= 1) return `${Math.round(days)}d`;
		const h = Math.floor(ms / 3_600_000);
		const m = Math.round((ms % 3_600_000) / 60_000);
		if (m === 0) return `${h}h`;
		return `${h}h ${m}m`;
	}

	const GROUP_LABEL_KEYS: Record<string, MessageKey> = {
		active: 'page.settings.shiftGroupActive',
		'this-week': 'page.settings.shiftGroupThisWeek',
		'next-week': 'page.settings.shiftGroupNextWeek',
		later: 'page.settings.shiftGroupLater'
	};

	const grouped = $derived.by(() => {
		const groups: { key: string; label: string; shifts: Shift[] }[] = [];
		for (const shift of data.upcomingShifts) {
			const key = shiftGroup(shift);
			const existing = groups.find((g) => g.key === key);
			if (existing) existing.shifts.push(shift);
			else groups.push({ key, label: t(locale, GROUP_LABEL_KEYS[key]), shifts: [shift] });
		}
		return groups;
	});
</script>

<svelte:head>
	<title>{t(locale, 'page.settings.title')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<PageHeader
		title={t(locale, 'page.settings.title')}
		subtitle={t(locale, 'page.settings.subtitle')}
		tint="muted"
	>
		{#snippet icon()}<Settings class="h-5 w-5" />{/snippet}
	</PageHeader>

	<AccountCard
		user={data.user}
		immichEnabled={data.immichEnabled ?? false}
		successMessage={form?.accountSuccess ? t(locale, 'page.settings.accountUpdated') : undefined}
		errorMessage={form?.accountError}
	/>

	<LanguageCard
		currentLocale={data.demoMode ? (data.locale ?? 'en') : (data.user?.locale ?? 'en')}
		demoMode={data.demoMode}
	/>

	<AppearanceCard
		currentTheme={(data.user?.theme as Theme) ?? 'system'}
		redirectPath="/care/settings"
		demoMode={data.demoMode}
	/>

	<ReminderUndoCard
		currentValue={data.user?.reminderUndoSeconds ?? null}
		defaultSeconds={data.reminderUndoDefault}
		successMessage={form?.reminderUndoSuccess
			? t(locale, 'page.settings.reminderUndoUpdated')
			: undefined}
		errorMessage={form?.reminderUndoError}
	/>

	{#if data.mailEnabled || data.ntfyEnabled}
		<NotificationsCard
			reminderEnabled={data.user?.notifyReminderEmail ?? false}
			shiftEnabled={data.user?.notifyShiftEmail ?? false}
			hasEmail={Boolean(data.user?.email)}
			mailEnabled={data.mailEnabled}
			ntfyEnabled={data.ntfyEnabled}
			ntfyTopic={data.user?.ntfyTopic ?? null}
			successMessage={form?.notificationsSuccess
				? t(locale, 'page.settings.notificationsUpdated')
				: undefined}
			errorMessage={form?.notificationsError}
			testSuccessMessage={form?.notificationsTestSuccess
				? t(locale, 'page.settings.testSent')
				: undefined}
			testErrorMessage={form?.notificationsTestError}
		/>
	{/if}

	<Card id="shifts">
		<CardHeader>
			<div class="flex items-center gap-2">
				<CardTitle>{t(locale, 'page.settings.shiftsCard')}</CardTitle>
				{#if data.upcomingShifts.length > 0}
					<Badge variant="secondary" class="tabular-nums">{data.upcomingShifts.length}</Badge>
				{/if}
			</div>
		</CardHeader>
		<CardContent>
			{#if data.upcomingShifts.length === 0}
				<EmptyState tint="muted" title={t(locale, 'page.settings.noUpcomingShifts')}>
					{#snippet icon()}<CalendarClock class="h-5 w-5" />{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-4">
					{#each grouped as group (group.key)}
						<div>
							<h3
								class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5"
							>
								{group.label}
							</h3>
							<div class="space-y-1">
								{#each group.shifts as shift (shift.id)}
									{@const isActive = group.key === 'active'}
									{@const isNext =
										!isActive && shift.id === data.upcomingShifts.find((s) => s.startAt > now)?.id}
									<div
										class="rounded-lg overflow-hidden {isActive
											? 'bg-teal/10 ring-1 ring-teal/30'
											: isNext
												? 'ring-1 ring-primary/20'
												: ''}"
									>
										<button
											type="button"
											onclick={() =>
												(expandedShiftId = expandedShiftId === shift.id ? null : shift.id)}
											class="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left {shift.notes
												? 'hover:bg-accent/50 transition-colors'
												: 'cursor-default'}"
										>
											{#if isActive}
												<span
													class="inline-block w-2 h-2 rounded-full bg-teal shrink-0"
													aria-hidden="true"
												></span>
											{/if}
											<div class="flex-1 min-w-0">
												<span class={isActive ? 'text-teal font-medium' : 'text-foreground'}>
													<LocalTime date={shift.startAt} format="datetime" />
												</span>
												<span class="text-muted-foreground mx-1">–</span>
												{#if shift.startAt.toDateString() === shift.endAt.toDateString()}
													<span class="text-muted-foreground"
														><LocalTime date={shift.endAt} format="time" /></span
													>
												{:else}
													<span class="text-muted-foreground"
														><LocalTime date={shift.endAt} format="datetime" /></span
													>
												{/if}
											</div>
											<Badge variant="secondary" class="shrink-0 tabular-nums"
												>{shiftDuration(shift)}</Badge
											>
										</button>
										{#if shift.notes && expandedShiftId === shift.id}
											<div class="px-3 pb-2.5 text-xs text-muted-foreground animate-slide-up">
												{shift.notes}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</CardContent>
	</Card>

	{#if data.calendarFeedAvailable}
		<CalendarFeedCard
			calendarToken={form?.calendarToken}
			calendarFeedEnabled={data.calendarFeedEnabled}
		/>
	{/if}

	<SecurityCard
		totpEnabled={data.user?.totpEnabled ?? false}
		available={data.twoFactorAvailable}
		enforced={data.twoFactorEnforced}
		{form}
	/>
</div>
