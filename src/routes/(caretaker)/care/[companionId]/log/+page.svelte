<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { Card, CardHeader, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Trash2, Activity, Lock } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { activityTypeOptions, ACTIVITY_ICONS } from '$lib/i18n/labels';

	// isOnShift and nextShift come from the caretaker layout data

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();

	const EVENT_TYPES = activityTypeOptions(locale);

	const TYPE_VALUES = EVENT_TYPES.map((t) => t.value);
	type ActivityType = (typeof TYPE_VALUES)[number];
	const initialType = (() => {
		const q = page.url.searchParams.get('type');
		return q && (TYPE_VALUES as string[]).includes(q)
			? (q as ActivityType)
			: ('walk' as ActivityType);
	})();
	let selectedType = $state(initialType);
	let duration = $state('');
	let notes = $state('');

	// "Also log for" — other companions this caretaker is assigned to (layout-filtered to active).
	let siblingCompanions = $derived(
		(data.companions ?? []).filter((c) => c.id !== data.companion.id)
	);
	let selectedAdditionalIds = $state<string[]>([]);
	let hasDuration = $derived(
		EVENT_TYPES.find((t) => t.value === selectedType)?.hasDuration ?? false
	);

	function defaultLoggedAt() {
		const now = new Date();
		const offset = now.getTimezoneOffset() * 60000;
		return new Date(now.getTime() - offset).toISOString().slice(0, 16);
	}

	const TYPE_PILL_LABELS = Object.fromEntries(
		EVENT_TYPES.map((t) => [t.value, `${t.icon} ${t.label}`])
	);
</script>

<svelte:head>
	<title>{t(locale, 'page.log.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<div class="space-y-5">
	<PageHeader
		title={t(locale, 'page.log.title')}
		subtitle={t(locale, 'page.log.subtitle', { name: data.companion.name })}
		tint="gold"
	>
		{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if !data.isOnShift}
		<Card>
			<CardContent class="py-4">
				<EmptyState tint="muted" title={t(locale, 'page.log.noActiveShift')}>
					{#snippet icon()}<Lock class="h-5 w-5" />{/snippet}
				</EmptyState>
				{#if data.nextShift}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.log.nextShiftStarts')}
						<LocalTime date={data.nextShift.startAt} format="datetime" />.
					</p>
				{:else}
					<p class="text-sm text-center text-muted-foreground pb-4">
						{t(locale, 'page.log.noUpcomingShifts')}
					</p>
				{/if}
			</CardContent>
		</Card>
	{:else}
		{#if form?.success}
			<div
				class="rounded-lg border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal animate-fade-in"
			>
				{t(locale, 'page.log.activityLogged')}
			</div>
		{/if}

		{#if form?.error}
			<div
				role="alert"
				class="rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
			>
				{form.error}
			</div>
		{/if}

		<!-- Quick log -->
		<Card>
			<CardHeader class="pb-3">
				<h2 class="font-semibold">{t(locale, 'page.log.quickLogTitle')}</h2>
			</CardHeader>
			<CardContent>
				<form
					method="POST"
					action="?/add"
					use:localDatetimes
					use:enhance={() =>
						async ({ result, update }) => {
							await update({ reset: false });
							if (result.type === 'success') {
								duration = '';
								notes = '';
								selectedAdditionalIds = [];
							}
						}}
					class="space-y-4"
				>
					<!-- Activity type pills -->
					<fieldset class="space-y-2 border-0 p-0 m-0">
						<legend class="text-sm font-medium text-foreground"
							>{t(locale, 'page.log.activityLabel')}</legend
						>
						<div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
							{#each EVENT_TYPES as t (t.value)}
								<label class="cursor-pointer">
									<input
										type="radio"
										name="type"
										value={t.value}
										bind:group={selectedType}
										class="sr-only peer"
									/>
									<span
										class="flex items-center justify-center gap-1 rounded-xl border px-3 py-3
									text-sm font-medium transition-all text-center
									peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
									{selectedType === t.value
											? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
											: 'border-border text-muted-foreground hover:border-border hover:bg-accent hover:text-accent-foreground'}"
									>
										{TYPE_PILL_LABELS[t.value] ?? t.label}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					{#if siblingCompanions.length > 0}
						<fieldset class="space-y-1.5 border-0 p-0 m-0">
							<legend class="text-sm font-medium text-foreground"
								>{t(locale, 'page.log.alsoLogFor')}</legend
							>
							<p class="text-xs text-muted-foreground">
								{t(locale, 'page.log.alsoLogForHint')}
							</p>
							<div class="flex flex-wrap gap-2">
								{#each siblingCompanions as sibling (sibling.id)}
									{@const checked = selectedAdditionalIds.includes(sibling.id)}
									<label class="cursor-pointer">
										<input
											type="checkbox"
											name="additionalCompanionIds"
											value={sibling.id}
											bind:group={selectedAdditionalIds}
											class="sr-only peer"
										/>
										<span
											class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
											peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
											{checked
												? 'bg-primary/10 border-primary/30 text-primary'
												: 'border-border text-muted-foreground hover:text-foreground'}"
										>
											{sibling.name}
										</span>
									</label>
								{/each}
							</div>
						</fieldset>
					{/if}

					{#if hasDuration}
						<div class="space-y-1.5 animate-slide-up">
							<Label for="duration">{t(locale, 'page.log.durationLabel')}</Label>
							<div class="flex gap-2">
								{#each [15, 30, 45, 60] as mins (mins)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => (duration = String(mins))}>{mins}m</Button
									>
								{/each}
								<input
									id="duration"
									name="durationMinutes"
									type="number"
									min="1"
									max="480"
									autocomplete="off"
									bind:value={duration}
									class="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
									placeholder="30"
								/>
							</div>
						</div>
					{/if}

					<div class="space-y-1.5">
						<Label for="loggedAt">{t(locale, 'page.log.whenLabel')}</Label>
						<input
							id="loggedAt"
							name="loggedAt"
							autocomplete="off"
							type="datetime-local"
							value={defaultLoggedAt()}
							class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="notes"
							>{t(locale, 'page.log.notesLabel')}
							<span class="font-normal text-muted-foreground"
								>{t(locale, 'page.log.notesOptional')}</span
							></Label
						>
						<MarkdownTextarea
							id="notes"
							name="notes"
							bind:value={notes}
							placeholder={t(locale, 'page.log.notesPlaceholder')}
							rows={3}
						/>
					</div>

					<Button type="submit" class="w-full text-base" size="lg">
						{t(locale, 'page.log.logButton', {
							activity: TYPE_PILL_LABELS[selectedType] ?? selectedType
						})}
					</Button>
				</form>
			</CardContent>
		</Card>

		<!-- Today's log -->
		<Card>
			<CardHeader class="pb-3">
				<h2 class="font-semibold">{t(locale, 'page.log.todaySoFar')}</h2>
			</CardHeader>
			<CardContent>
				{#if data.todayEvents.length === 0}
					<EmptyState size="sm" tint="gold" title={t(locale, 'page.log.nothingLoggedYet')}>
						{#snippet icon()}<Activity class="h-5 w-5" />{/snippet}
					</EmptyState>
				{:else}
					<div class="space-y-2">
						{#each data.todayEvents as event (event.id)}
							<div class="flex items-center gap-3 py-2 border-b last:border-0">
								<span
									class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg"
									>{ACTIVITY_ICONS[event.type] ?? '📝'}</span
								>
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2">
										<Badge variant="gold" class="capitalize">{event.type}</Badge>
										{#if event.durationMinutes}
											<span class="text-xs text-muted-foreground">{event.durationMinutes} min</span>
										{/if}
									</div>
									{#if event.notes}
										<p class="text-sm truncate text-muted-foreground mt-0.5">{event.notes}</p>
									{/if}
								</div>
								<div class="text-xs shrink-0 text-muted-foreground text-right">
									<LocalTime date={event.loggedAt} format="time" />
									<ByLine user={event.logger} />
								</div>
								{#if event.loggedBy === data.user?.id}
									<form
										method="POST"
										action="?/delete"
										use:enhance={() =>
											async ({ update }) => {
												await update({ reset: false });
											}}
									>
										<input type="hidden" name="id" value={event.id} />
										<Button
											type="submit"
											variant="ghost"
											size="sm"
											class="h-7 w-7 p-0 text-muted-foreground hover:text-coral"
											aria-label={t(locale, 'aria.deleteEntry')}
										>
											<Trash2 class="h-3.5 w-3.5" />
										</Button>
									</form>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
