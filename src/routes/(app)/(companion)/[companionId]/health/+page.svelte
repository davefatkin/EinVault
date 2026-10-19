<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Scale, Plus, Pencil, Trash2, FileText, HeartPulse } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import WeightChart from '$lib/components/WeightChart.svelte';
	import DocumentPreview from '$lib/components/DocumentPreview.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import HealthDetailModal from '$lib/components/health/HealthDetailModal.svelte';
	import HealthEventForm from '$lib/components/health/HealthEventForm.svelte';
	import WeightForm from '$lib/components/health/WeightForm.svelte';
	import { stripMarkdown } from '$lib/markdown';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeOptions, healthTypeLabel } from '$lib/i18n/labels';
	import { reminderPrefillUrl, type HealthEventType, type HealthDetail } from '$lib/health';
	import { WEIGHT_UNITS } from '$lib/activityTypes';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();

	let weightPoints = $derived(
		[...data.weightEntries]
			.map((w) => ({
				recordedAt: new Date(w.recordedAt),
				weight: w.weight,
				unit: w.unit
			}))
			.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())
	);

	// Document preview (documents attached to a health event)
	type LinkedDoc = (typeof data.linkedDocuments)[0];
	let previewDoc = $state<LinkedDoc | null>(null);
	function docsForEvent(eventId: string): LinkedDoc[] {
		return data.linkedDocuments.filter((d) => d.healthEventId === eventId);
	}
	function docUrl(doc: LinkedDoc) {
		return `/api/documents/${data.companion.id}/${doc.filename}`;
	}

	let showHealthForm = $state(false);
	let showWeightForm = $state(false);
	let submittingHealth = $state(false);
	let submittingWeight = $state(false);

	const HEALTH_TYPES = healthTypeOptions(locale);
	const HEALTH_TYPE_VALUES = HEALTH_TYPES.map((ht) => ht.value);

	// Prefill state for the "Log event" flow from the reminders pages.
	// Empty strings mean "no prefill" and the form falls back to defaults.
	let prefillTitle = $state('');
	let prefillType = $state<HealthEventType | ''>('');
	let prefillDescription = $state('');
	let prefillApplied = $state(false);

	function resetHealthPrefill() {
		prefillTitle = '';
		prefillType = '';
		prefillDescription = '';
	}

	function localDatetimeISO(d: Date | string = new Date()) {
		const dt = new Date(d);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
	}
	let todayISO = $state(localDatetimeISO());

	let editingHealthId = $state<string | null>(null);
	function startEditHealth(event: (typeof data.healthEvents)[0]) {
		editingHealthId = event.id;
	}

	let editingWeightId = $state<string | null>(null);
	function startEditWeight(entry: (typeof data.weightEntries)[0]) {
		editingWeightId = entry.id;
	}

	let confirmOpen = $state(false);
	let confirmAction = $state<(() => void) | null>(null);
	function openConfirm(action: () => void) {
		confirmAction = action;
		confirmOpen = true;
	}

	let deleteWeightId = $state('');
	let deleteWeightForm = $state<HTMLFormElement | null>(null);
	let deleteHealthId = $state('');
	let deleteHealthForm = $state<HTMLFormElement | null>(null);

	// Open the edit form once per `?edit=` deep link (from the dashboard
	// weight/health detail modal). The guard is load-bearing: without it,
	// saving re-runs the load (new `data`), the effect re-fires while `edit`
	// is still in the URL, and the form pops back open. Stripping the param
	// keeps a reload from reopening it too.
	let lastEditDeepLink = '';
	$effect(() => {
		const editId = page.url.searchParams.get('edit');
		if (!editId || editId === lastEditDeepLink) return;
		lastEditDeepLink = editId;
		const weightMatch = data.weightEntries.find((e) => e.id === editId);
		if (weightMatch) {
			editingWeightId = editId;
		} else {
			const healthMatch = data.healthEvents.find((e) => e.id === editId);
			if (healthMatch) {
				editingHealthId = editId;
			}
		}
		tick().then(() => {
			const url = new URL(page.url.href);
			url.searchParams.delete('edit');
			history.replaceState(history.state, '', url.pathname + url.search);
		});
	});

	$effect(() => {
		if (prefillApplied) return;
		const params = page.url.searchParams;
		const newParam = params.get('new');
		if (!newParam) return;
		if (params.get('edit')) return;

		if (newParam === 'weight') {
			showWeightForm = true;
			showHealthForm = false;
		} else {
			prefillTitle = (params.get('title') ?? '').slice(0, 200);
			const rawType = params.get('type') ?? '';
			prefillType = (HEALTH_TYPE_VALUES as string[]).includes(rawType)
				? (rawType as HealthEventType)
				: '';
			prefillDescription = (params.get('description') ?? '').slice(0, 2000);

			showHealthForm = true;
			showWeightForm = false;
		}
		prefillApplied = true;
		tick().then(() => {
			const url = new URL(page.url.href);
			['new', 'title', 'type', 'description'].forEach((k) => url.searchParams.delete(k));
			history.replaceState(history.state, '', url.pathname + url.search);
		});
	});

	// Track the last id we opened so the effect re-fires when a search result
	// deep-links to a DIFFERENT item or companion (SvelteKit reuses this page
	// component across companion navigations), but not for the same one.
	let lastDeepLinkId = '';
	$effect(() => {
		const params = page.url.searchParams;
		const healthId = params.get('detailHealth');
		const weightId = params.get('detailWeight');
		const id = healthId ?? weightId;
		if (!id || id === lastDeepLinkId) return;
		lastDeepLinkId = id;
		if (healthId) {
			const match = data.healthEvents.find((e) => e.id === healthId);
			if (match) openDetail({ kind: 'health', item: match });
		} else if (weightId) {
			const match = data.weightEntries.find((e) => e.id === weightId);
			if (match) openDetail({ kind: 'weight', item: match });
		}
		tick().then(() => {
			const url = new URL(page.url.href);
			url.searchParams.delete('detailHealth');
			url.searchParams.delete('detailWeight');
			history.replaceState(history.state, '', url.pathname + url.search);
		});
	});

	// Detail modal
	type SelectedItem =
		| { kind: 'weight'; item: (typeof data.weightEntries)[0] }
		| { kind: 'health'; item: (typeof data.healthEvents)[0] };

	let selected = $state<SelectedItem | null>(null);

	function toDetail(s: SelectedItem): HealthDetail {
		if (s.kind === 'health') {
			const h = s.item;
			return {
				kind: 'health',
				id: h.id,
				type: h.type,
				title: h.title,
				at: h.occurredAt,
				vetName: h.vetName,
				vetClinic: h.vetClinic,
				notes: h.notes,
				logger: h.logger,
				journalDates: data.journalDatesByEvent[h.id] ?? []
			};
		}
		const w = s.item;
		return {
			kind: 'weight',
			id: w.id,
			weight: w.weight,
			unit: w.unit,
			at: w.recordedAt,
			notes: w.notes,
			logger: w.logger
		};
	}

	function openDetail(s: SelectedItem) {
		selected = s;
	}

	function closeDetail() {
		selected = null;
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.health.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

{#if selected}
	<HealthDetailModal
		detail={toDetail(selected)}
		documents={selected.kind === 'health' ? docsForEvent(selected.item.id) : []}
		onclose={closeDetail}
		onPreviewDocument={(doc) => (previewDoc = doc)}
		footer={data.companion.isActive !== false ? detailActions : undefined}
		journalHref={(d) => `/${data.companion.id}/journal/${d}`}
	/>
{/if}

{#snippet detailActions()}
	{#if selected?.kind === 'weight'}
		<Button
			variant="soft"
			size="sm"
			onclick={() => {
				if (selected?.kind === 'weight') {
					const item = selected.item;
					closeDetail();
					startEditWeight(item);
				}
			}}
		>
			<Pencil class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'common.edit')}
		</Button>
		<Button
			variant="softDestructive"
			size="sm"
			onclick={() => {
				if (selected?.kind === 'weight') {
					const item = selected.item;
					closeDetail();
					deleteWeightId = item.id;
					openConfirm(() => deleteWeightForm?.requestSubmit());
				}
			}}
		>
			<Trash2 class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'common.delete')}
		</Button>
	{:else if selected?.kind === 'health'}
		<Button
			variant="soft"
			size="sm"
			onclick={() => {
				if (selected?.kind === 'health') {
					const item = selected.item;
					closeDetail();
					startEditHealth(item);
				}
			}}
		>
			<Pencil class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'common.edit')}
		</Button>
		<Button
			variant="soft"
			size="sm"
			href={reminderPrefillUrl(
				data.companion.id,
				selected.item.type,
				selected.item.title,
				selected.item.notes
			)}
		>
			<Plus class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'page.reminders.addReminder')}
		</Button>
		<Button
			variant="softDestructive"
			size="sm"
			onclick={() => {
				if (selected?.kind === 'health') {
					const item = selected.item;
					closeDetail();
					deleteHealthId = item.id;
					openConfirm(() => deleteHealthForm?.requestSubmit());
				}
			}}
		>
			<Trash2 class="h-3.5 w-3.5 mr-1.5" />
			{t(locale, 'common.delete')}
		</Button>
	{/if}
{/snippet}

<div class="space-y-6 pb-20 md:pb-0">
	{#if !data.companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.health.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<PageHeader title={t(locale, 'page.health.title')} tint="teal">
		{#snippet icon()}<HeartPulse class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			{#if data.companion.isActive !== false}
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						showWeightForm = !showWeightForm;
						showHealthForm = false;
					}}
				>
					<Scale class="h-4 w-4 mr-1.5" />
					{t(locale, 'page.health.logWeight')}
				</Button>
				<Button
					size="sm"
					onclick={() => {
						showHealthForm = !showHealthForm;
						showWeightForm = false;
						if (!showHealthForm) resetHealthPrefill();
					}}
				>
					<Plus class="h-4 w-4 mr-1.5" />
					{t(locale, 'page.health.addEvent')}
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if form?.healthError || form?.weightError}
		<Alert variant="coral">
			<AlertDescription>{form.healthError ?? form.weightError}</AlertDescription>
		</Alert>
	{/if}

	{#if showHealthForm}
		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.health.newHealthEventTitle')}</CardTitle>
			</CardHeader>
			<CardContent>
				<HealthEventForm
					action="?/addHealth"
					defaultAt={todayISO}
					submitting={submittingHealth}
					prefill={{ title: prefillTitle, type: prefillType, notes: prefillDescription }}
					submit={() => {
						submittingHealth = true;
						return async ({ update }) => {
							await update();
							submittingHealth = false;
							showHealthForm = false;
							resetHealthPrefill();
						};
					}}
					oncancel={() => {
						showHealthForm = false;
						resetHealthPrefill();
					}}
				/>
			</CardContent>
		</Card>
	{/if}

	{#if showWeightForm}
		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.health.logWeightTitle')}</CardTitle>
			</CardHeader>
			<CardContent>
				<WeightForm
					action="?/addWeight"
					defaultAt={todayISO}
					submitting={submittingWeight}
					defaultUnit={data.companion.weightUnit}
					submit={() => {
						submittingWeight = true;
						return async ({ update }) => {
							await update();
							submittingWeight = false;
							showWeightForm = false;
						};
					}}
					oncancel={() => (showWeightForm = false)}
				/>
			</CardContent>
		</Card>
	{/if}

	<section>
		<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
			{t(locale, 'page.health.weightTrend')}
		</p>
		<WeightChart
			entries={weightPoints}
			displayUnit={data.companion.weightUnit}
			onAddWeight={data.companion.isActive !== false ? () => (showWeightForm = true) : undefined}
		/>
	</section>

	{#if data.weightEntries.length > 0}
		<section>
			<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
				{t(locale, 'page.health.weightHistoryTitle')}
			</p>
			<div class="rounded-2xl border bg-card divide-y divide-border">
				{#each data.weightEntries as entry (entry.id)}
					{#if editingWeightId === entry.id}
						<div class="px-6 py-4">
							<form
								method="POST"
								action="?/updateWeight"
								use:localDatetimes
								use:enhance={() =>
									({ update }) => {
										update();
										editingWeightId = null;
									}}
								class="space-y-4"
							>
								<input type="hidden" name="id" value={entry.id} />
								<div class="grid grid-cols-3 gap-4">
									<div class="space-y-1.5 col-span-2">
										<Label for="edit-weight-{entry.id}"
											>{t(locale, 'page.health.labelWeight')}</Label
										>
										<Input
											id="edit-weight-{entry.id}"
											name="weight"
											type="number"
											step="0.1"
											min="0"
											autocomplete="off"
											value={entry.weight}
											required
										/>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-unit-{entry.id}">{t(locale, 'page.health.labelUnit')}</Label>
										<Select id="edit-unit-{entry.id}" name="unit">
											{#each WEIGHT_UNITS as u (u)}
												<option value={u} selected={entry.unit === u}>{u}</option>
											{/each}
										</Select>
									</div>
								</div>
								<div class="space-y-1.5">
									<Label for="edit-recordedAt-{entry.id}"
										>{t(locale, 'page.health.labelRecordedAt')}</Label
									>
									<Input
										id="edit-recordedAt-{entry.id}"
										name="recordedAt"
										type="datetime-local"
										autocomplete="off"
										value={localDatetimeISO(entry.recordedAt)}
									/>
								</div>
								<div class="space-y-1.5">
									<Label for="edit-weightNotes-{entry.id}"
										>{t(locale, 'page.health.labelNotes')}</Label
									>
									<MarkdownTextarea
										id="edit-weightNotes-{entry.id}"
										name="notes"
										value={entry.notes ?? ''}
										placeholder={t(locale, 'page.health.placeholderWeightNotes')}
										rows={3}
									/>
								</div>
								<div class="flex gap-3">
									<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => (editingWeightId = null)}>{t(locale, 'common.cancel')}</Button
									>
								</div>
							</form>
						</div>
					{:else}
						<div
							class="flex flex-col gap-3 px-6 py-3 text-sm transition-colors hover:bg-accent/40 sm:flex-row sm:items-center sm:gap-4"
						>
							<button
								type="button"
								onclick={() => openDetail({ kind: 'weight', item: entry })}
								class="flex flex-1 items-center gap-4 text-sm text-left rounded-md min-w-0"
							>
								<span class="w-24 shrink-0 text-xs whitespace-nowrap text-muted-foreground"
									><LocalTime date={entry.recordedAt} /></span
								>
								<span class="w-20 shrink-0 font-semibold text-foreground"
									>{entry.weight} {entry.unit}</span
								>
								<div class="flex-1 min-w-0 text-xs text-muted-foreground">
									<span class="truncate block">{entry.notes ? stripMarkdown(entry.notes) : ''}</span
									>
									<ByLine user={entry.logger} />
								</div>
							</button>
							{#if data.companion.isActive !== false}
								<div class="flex gap-1 shrink-0 self-end sm:self-auto">
									<Button
										type="button"
										variant="soft"
										size="sm"
										onclick={() => startEditWeight(entry)}
										class="h-7 gap-1.5 px-2 text-xs"
									>
										<Pencil class="h-3.5 w-3.5" />
										<span class="hidden sm:inline">{t(locale, 'common.edit')}</span>
									</Button>
									<Button
										type="button"
										variant="softDestructive"
										size="sm"
										class="h-7 gap-1.5 px-2 text-xs"
										onclick={() => {
											deleteWeightId = entry.id;
											openConfirm(() => deleteWeightForm?.requestSubmit());
										}}
									>
										<Trash2 class="h-3.5 w-3.5" />
										<span class="hidden sm:inline">{t(locale, 'common.delete')}</span>
									</Button>
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<section>
		<p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
			{t(locale, 'page.health.healthEventsTitle')}
		</p>
		<div class="rounded-2xl border bg-card px-5 py-4">
			{#if data.healthEvents.length === 0}
				<EmptyState
					tint="teal"
					title={t(locale, 'page.health.noHealthEvents')}
					body={t(locale, 'page.health.emptyBody')}
				>
					{#snippet icon()}<HeartPulse class="h-5 w-5" />{/snippet}
					{#snippet action()}
						{#if data.companion.isActive !== false}
							<Button onclick={() => (showHealthForm = true)}
								>{t(locale, 'nav.fab.logHealth')}</Button
							>
						{/if}
					{/snippet}
				</EmptyState>
			{:else}
				<div class="space-y-3">
					{#each data.healthEvents as event (event.id)}
						{#if editingHealthId === event.id}
							<div class="border border-border rounded-lg px-4 py-4">
								<form
									method="POST"
									action="?/updateHealth"
									use:localDatetimes
									use:enhance={() =>
										({ update }) => {
											update();
											editingHealthId = null;
										}}
									class="space-y-4"
								>
									<input type="hidden" name="id" value={event.id} />
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div class="space-y-1.5">
											<Label for="edit-title-{event.id}"
												>{t(locale, 'page.health.labelTitle')}</Label
											>
											<Input
												id="edit-title-{event.id}"
												name="title"
												type="text"
												autocomplete="off"
												value={event.title}
												required
											/>
										</div>
										<div class="space-y-1.5">
											<Label for="edit-type-{event.id}">{t(locale, 'page.health.labelType')}</Label>
											<Select id="edit-type-{event.id}" name="type" required>
												{#each HEALTH_TYPES as ht (ht.value)}
													<option value={ht.value} selected={event.type === ht.value}
														>{ht.label}</option
													>
												{/each}
											</Select>
										</div>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-occurredAt-{event.id}"
											>{t(locale, 'page.health.labelDate')}</Label
										>
										<Input
											id="edit-occurredAt-{event.id}"
											name="occurredAt"
											type="datetime-local"
											autocomplete="off"
											value={localDatetimeISO(event.occurredAt)}
										/>
									</div>
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
										<div class="space-y-1.5">
											<Label for="edit-vetName-{event.id}"
												>{t(locale, 'page.health.labelVetName')}</Label
											>
											<Input
												id="edit-vetName-{event.id}"
												name="vetName"
												type="text"
												autocomplete="off"
												value={event.vetName ?? ''}
												placeholder={t(locale, 'page.health.placeholderVetName')}
											/>
										</div>
										<div class="space-y-1.5">
											<Label for="edit-vetClinic-{event.id}"
												>{t(locale, 'page.health.labelClinic')}</Label
											>
											<Input
												id="edit-vetClinic-{event.id}"
												name="vetClinic"
												type="text"
												autocomplete="off"
												value={event.vetClinic ?? ''}
												placeholder={t(locale, 'page.health.placeholderClinic')}
											/>
										</div>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-notes-{event.id}">{t(locale, 'page.health.labelNotes')}</Label>
										<MarkdownTextarea
											id="edit-notes-{event.id}"
											name="notes"
											value={event.notes ?? ''}
											placeholder={t(locale, 'page.health.placeholderNotes')}
											rows={4}
										/>
									</div>
									<div class="flex gap-3">
										<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => (editingHealthId = null)}>{t(locale, 'common.cancel')}</Button
										>
									</div>
								</form>
							</div>
						{:else}
							<div
								class="flex flex-col gap-3 py-2 border-b border-border last:border-0 transition-colors hover:bg-accent/40 sm:flex-row sm:items-start sm:gap-4"
							>
								<button
									type="button"
									onclick={() => openDetail({ kind: 'health', item: event })}
									class="flex flex-1 items-start gap-4 text-left rounded-md min-w-0"
								>
									<div class="shrink-0 text-right w-20">
										<span class="text-xs text-muted-foreground"
											><LocalTime date={event.occurredAt} /></span
										>
									</div>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<Badge variant="teal" class="capitalize"
												>{healthTypeLabel(locale, event.type)}</Badge
											>
											<span class="font-medium text-sm text-foreground">{event.title}</span>
										</div>
										{#if event.vetName || event.vetClinic}
											<p class="text-xs mt-0.5 text-muted-foreground">
												{[event.vetName, event.vetClinic].filter(Boolean).join(' · ')}
											</p>
										{/if}
										{#if event.notes}
											<p class="text-sm mt-1 text-muted-foreground">
												{stripMarkdown(event.notes)}
											</p>
										{/if}
										{#if data.linkedDocuments.some((d) => d.healthEventId === event.id)}
											<div class="mt-1 flex flex-wrap gap-2">
												{#each data.linkedDocuments.filter((d) => d.healthEventId === event.id) as doc (doc.id)}
													<span
														class="inline-flex items-center gap-1 text-xs text-muted-foreground"
													>
														<FileText class="h-3 w-3" />{doc.title}
													</span>
												{/each}
											</div>
										{/if}
										<ByLine user={event.logger} class="mt-0.5" />
									</div>
								</button>
								{#if data.companion.isActive !== false}
									<div class="flex gap-1 shrink-0 self-end sm:self-auto">
										<Button
											type="button"
											variant="soft"
											size="sm"
											onclick={() => startEditHealth(event)}
											class="h-7 gap-1.5 px-2 text-xs"
										>
											<Pencil class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">{t(locale, 'common.edit')}</span>
										</Button>
										<Button
											type="button"
											variant="softDestructive"
											size="sm"
											class="h-7 gap-1.5 px-2 text-xs"
											onclick={() => {
												deleteHealthId = event.id;
												openConfirm(() => deleteHealthForm?.requestSubmit());
											}}
										>
											<Trash2 class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">{t(locale, 'common.delete')}</span>
										</Button>
									</div>
								{/if}
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>

<form bind:this={deleteWeightForm} method="POST" action="?/deleteWeight" use:enhance class="hidden">
	<input type="hidden" name="id" value={deleteWeightId} />
</form>
<form bind:this={deleteHealthForm} method="POST" action="?/deleteHealth" use:enhance class="hidden">
	<input type="hidden" name="id" value={deleteHealthId} />
</form>

<ConfirmDialog
	open={confirmOpen}
	message={t(locale, 'component.confirmDialog.cantBeUndone')}
	onconfirm={() => {
		confirmOpen = false;
		confirmAction?.();
	}}
	oncancel={() => (confirmOpen = false)}
/>

{#if previewDoc}
	<DocumentPreview
		open={true}
		url={docUrl(previewDoc)}
		mimeType={previewDoc.mimeType}
		title={previewDoc.title}
		onclose={() => (previewDoc = null)}
	/>
{/if}
