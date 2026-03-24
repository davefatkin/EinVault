<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Calendar } from '@lucide/svelte';
	import { SvelteDate } from 'svelte/reactivity';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showPasswordFields = $state(false);
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

	const GROUP_LABELS: Record<string, string> = {
		active: 'Active Now',
		'this-week': 'This Week',
		'next-week': 'Next Week',
		later: 'Later'
	};

	const grouped = $derived(() => {
		const groups: { key: string; label: string; shifts: Shift[] }[] = [];
		for (const shift of data.upcomingShifts) {
			const key = shiftGroup(shift);
			const existing = groups.find((g) => g.key === key);
			if (existing) existing.shifts.push(shift);
			else groups.push({ key, label: GROUP_LABELS[key], shifts: [shift] });
		}
		return groups;
	});
</script>

<svelte:head>
	<title>Settings | EinVault</title>
</svelte:head>

<div class="max-w-lg mx-auto space-y-6">
	<div>
		<h1 class="font-display text-2xl font-bold text-foreground">Settings</h1>
		<p class="text-sm mt-1 text-muted-foreground">Manage your account.</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>Account</CardTitle>
		</CardHeader>
		<CardContent>
			{#if form?.accountSuccess}
				<Alert variant="success" class="mb-4">
					<AlertDescription>✓ Account updated.</AlertDescription>
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
					<Label for="displayName">Display name</Label>
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
					<Label for="username">Username</Label>
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
						Email <span class="text-muted-foreground font-normal">(optional)</span>
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
						Phone <span class="text-muted-foreground font-normal">(optional)</span>
					</Label>
					<Input
						id="phone"
						name="phone"
						type="tel"
						value={data.user?.phone ?? ''}
						autocomplete="tel"
						placeholder="(555) 000-0000"
					/>
				</div>

				<div>
					<button
						type="button"
						onclick={() => (showPasswordFields = !showPasswordFields)}
						class="text-sm text-primary hover:underline"
					>
						{showPasswordFields ? '↑ Cancel Password Change' : 'Change Password'}
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
							<Label for="currentPassword">Current password</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								placeholder="••••••••"
								autocomplete="current-password"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="newPassword">New password</Label>
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
							<Label for="confirmPassword">Confirm new password</Label>
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

				<Button type="submit">Save Changes</Button>
			</form>
		</CardContent>
	</Card>

	<!-- My Shifts -->
	<Card id="shifts">
		<CardHeader class="pb-3">
			<CardTitle class="font-semibold flex items-center gap-2">
				<Calendar class="h-4 w-4" /> My Shifts
				{#if data.upcomingShifts.length > 0}
					<Badge variant="secondary" class="ml-auto">{data.upcomingShifts.length}</Badge>
				{/if}
			</CardTitle>
		</CardHeader>
		<CardContent class="pt-0">
			{#if data.upcomingShifts.length === 0}
				<p class="text-sm italic text-muted-foreground">No upcoming shifts scheduled.</p>
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
						Export to calendar
					</a>
				</div>
			{/if}
		</CardContent>
	</Card>

	<Card>
		<CardContent class="pt-4">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">Role</span>
				<Badge variant="moss">Caretaker</Badge>
			</div>
		</CardContent>
	</Card>
</div>
