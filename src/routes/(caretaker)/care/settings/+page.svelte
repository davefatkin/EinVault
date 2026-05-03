<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ReminderUndoCard from '$lib/components/settings/ReminderUndoCard.svelte';
	import { Calendar } from '@lucide/svelte';
	import { SvelteDate } from 'svelte/reactivity';
	import { t, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS, type MessageKey } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const locale = getLocale();
	let showPasswordFields = $state(false);
	let localeForm: HTMLFormElement;
	let expandedShiftId = $state<string | null>(null);

	const now = new SvelteDate();

	type Shift = (typeof data.upcomingShifts)[0];

	function shiftGroup(shift: Shift): 'active' | 'this-week' | 'next-week' | 'later' {
		if (shift.startAt <= now && shift.endAt >= now) return 'active';
		const msPerDay = 86_400_000;
		const startOfToday = new SvelteDate(now);
		startOfToday.setHours(0, 0, 0, 0);
		const dayOfWeek = startOfToday.getDay(); // 0 = Sun
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

	const grouped = $derived(() => {
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

<div class="max-w-lg mx-auto space-y-6">
	<div>
		<h1 class="font-display text-2xl font-bold text-foreground">
			{t(locale, 'page.settings.title')}
		</h1>
		<p class="text-sm mt-1 text-muted-foreground">{t(locale, 'page.settings.subtitle')}</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.settings.accountCard')}</CardTitle>
		</CardHeader>
		<CardContent>
			{#if form?.accountSuccess}
				<Alert variant="success" class="mb-4">
					<AlertDescription>{t(locale, 'page.settings.accountUpdated')}</AlertDescription>
				</Alert>
			{/if}
			{#if form?.accountError}
				<Alert variant="destructive" class="mb-4">
					<AlertDescription>{form.accountError}</AlertDescription>
				</Alert>
			{/if}

			<form
				method="POST"
				action="?/account"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
				class="space-y-4"
			>
				<div class="space-y-1.5">
					<Label for="displayName">{t(locale, 'page.settings.labelDisplayName')}</Label>
					<Input
						id="displayName"
						name="displayName"
						type="text"
						autocomplete="name"
						value={data.user?.displayName ?? ''}
						required
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="username">{t(locale, 'page.settings.labelUsername')}</Label>
					<Input
						id="username"
						name="username"
						type="text"
						value={data.user?.username ?? ''}
						required
						autocomplete="username"
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="email">
						{t(locale, 'page.settings.labelEmail')}
						<span class="text-muted-foreground font-normal"
							>{t(locale, 'page.settings.optional')}</span
						>
					</Label>
					<Input
						id="email"
						name="email"
						type="email"
						value={data.user?.email ?? ''}
						autocomplete="email"
						placeholder="jet@black.com"
					/>
				</div>

				<div class="space-y-1.5">
					<Label for="phone">
						{t(locale, 'page.settings.labelPhone')}
						<span class="text-muted-foreground font-normal"
							>{t(locale, 'page.settings.optional')}</span
						>
					</Label>
					<Input
						id="phone"
						name="phone"
						type="tel"
						value={data.user?.phone ?? ''}
						autocomplete="tel"
						placeholder={t(locale, 'common.placeholderPhone')}
					/>
				</div>

				<div>
					<button
						type="button"
						onclick={() => (showPasswordFields = !showPasswordFields)}
						class="text-sm text-primary hover:underline"
					>
						{showPasswordFields
							? t(locale, 'page.settings.cancelPasswordChange')
							: t(locale, 'page.settings.changePassword')}
					</button>
				</div>

				{#if showPasswordFields}
					<input
						type="text"
						autocomplete="username"
						value={data.user?.username ?? ''}
						readonly
						tabindex="-1"
						aria-hidden="true"
						class="sr-only"
					/>
					<div class="space-y-4 animate-slide-up border-t border-border pt-4">
						<div class="space-y-1.5">
							<Label for="currentPassword">{t(locale, 'page.settings.labelCurrentPassword')}</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								placeholder="••••••••"
								autocomplete="current-password"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="newPassword">{t(locale, 'page.settings.labelNewPassword')}</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								placeholder="••••••••"
								minlength={8}
								autocomplete="new-password"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="confirmPassword">{t(locale, 'page.settings.labelConfirmPassword')}</Label>
							<Input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								placeholder="••••••••"
								minlength={8}
								autocomplete="new-password"
							/>
						</div>
					</div>
				{/if}

				<Button type="submit">{t(locale, 'page.settings.saveChanges')}</Button>
			</form>
		</CardContent>
	</Card>

	<!-- Language -->
	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.settings.languageCard')}</CardTitle>
		</CardHeader>
		<CardContent>
			<p class="text-sm text-muted-foreground mb-3">
				{t(locale, 'page.settings.languageDescription')}
			</p>
			<form
				method="POST"
				action="?/locale"
				bind:this={localeForm}
				use:enhance={() => {
					return async () => {
						window.location.reload();
					};
				}}
			>
				<div class="max-w-[200px]">
					<Select
						name="locale"
						value={data.user?.locale ?? 'en'}
						onchange={() => localeForm.requestSubmit()}
					>
						{#each SUPPORTED_LOCALES as loc (loc)}
							<option value={loc}>{LOCALE_LABELS[loc]}</option>
						{/each}
					</Select>
				</div>
			</form>
		</CardContent>
	</Card>

	<ReminderUndoCard
		currentValue={data.user?.reminderUndoSeconds ?? null}
		defaultSeconds={data.reminderUndoDefault}
		successMessage={form?.reminderUndoSuccess
			? t(locale, 'page.settings.reminderUndoUpdated')
			: undefined}
		errorMessage={form?.reminderUndoError}
	/>

	<!-- My Shifts -->
	<Card id="shifts">
		<CardHeader class="pb-3">
			<CardTitle class="font-semibold flex items-center gap-2">
				<Calendar class="h-4 w-4" />
				{t(locale, 'page.settings.shiftsCard')}
				{#if data.upcomingShifts.length > 0}
					<Badge variant="secondary" class="ml-auto">{data.upcomingShifts.length}</Badge>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="pt-0">
			{#if data.upcomingShifts.length === 0}
				<p class="text-sm italic text-muted-foreground">
					{t(locale, 'page.settings.noUpcomingShifts')}
				</p>
			{:else}
				<div class="space-y-4">
					{#each grouped() as group (group.key)}
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
											? 'bg-green-50 dark:bg-green-950 ring-1 ring-green-200 dark:ring-green-800'
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
													class="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0"
													aria-hidden="true"
												></span>
											{/if}
											<div class="flex-1 min-w-0">
												<span
													class={isActive
														? 'text-green-700 dark:text-green-300 font-medium'
														: 'text-foreground'}
												>
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
				<div class="mt-4 pt-3 border-t border-border">
					<a href="/api/shifts/export.ics" class="text-sm text-primary hover:underline">
						{t(locale, 'page.settings.exportCalendar')}
					</a>
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardContent class="pt-4">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">{t(locale, 'page.settings.roleLabel')}</span>
				<Badge variant="moss">{t(locale, 'enum.role.caretaker')}</Badge>
			</div>
		</CardContent>
	</Card>
</div>
