<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Scale, Plus, Pencil, Trash2, X } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeOptions, healthTypeLabel } from '$lib/i18n/labels';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	const locale = getLocale();
	let showHealthForm = $state(false);
	let showWeightForm = $state(false);
	let submittingHealth = $state(false);
	let submittingWeight = $state(false);

	const HEALTH_TYPES = healthTypeOptions(locale);

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

	$effect(() => {
		const editId = page.url.searchParams.get('edit');
		if (!editId) return;
		const weightMatch = data.weightEntries.find((e) => e.id === editId);
		if (weightMatch) {
			editingWeightId = editId;
			return;
		}
		const healthMatch = data.healthEvents.find((e) => e.id === editId);
		if (healthMatch) {
			editingHealthId = editId;
		}
	});

	// Detail modal
	type SelectedItem =
		| { kind: 'weight'; item: (typeof data.weightEntries)[0] }
		| { kind: 'health'; item: (typeof data.healthEvents)[0] };

	let selected = $state<SelectedItem | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);

	async function openDetail(s: SelectedItem) {
		selected = s;
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
		if (e.key === 'Escape') closeDetail();
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.health.title')} | {data.companion.name} | EinVault</title>
</svelte:head>

<!-- Detail modal -->
{#if selected}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label={t(locale, 'aria.closeDialog')}
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
					{#if selected.kind === 'weight'}
						{t(locale, 'page.health.detailWeightEntry')}
					{:else if selected.kind === 'health'}
						{selected.item.title}
					{/if}
				</h2>
				<button
					onclick={closeDetail}
					aria-label={t(locale, 'aria.close')}
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				{#if selected.kind === 'weight'}
					{@const w = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.health.detailWeight')}</span
						>
						<span class="text-xl font-bold text-foreground"
							>{w.weight}
							<span class="text-sm font-normal text-muted-foreground">{w.unit}</span></span
						>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.health.detailRecorded')}</span
						>
						<span class="text-foreground"
							><LocalTime date={w.recordedAt} format="datetime" />{#if w.logger}<span
									class="text-muted-foreground text-xs ml-1"
									>{t(locale, 'common.loggedBy', { name: w.logger.displayName })}</span
								>{/if}</span
						>
					</div>
					{#if w.notes}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.health.detailNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(w.notes)}
							</div>
						</div>
					{/if}
				{:else if selected.kind === 'health'}
					{@const h = selected.item}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.health.detailType')}</span
						>
						<Badge variant="bark" class="capitalize">{healthTypeLabel(locale, h.type)}</Badge>
					</div>
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.health.detailDate')}</span
						>
						<span class="text-foreground"
							><LocalTime date={h.occurredAt} format="datetime" />{#if h.logger}<span
									class="text-muted-foreground text-xs ml-1"
									>{t(locale, 'common.loggedBy', { name: h.logger.displayName })}</span
								>{/if}</span
						>
					</div>
					{#if h.nextDueAt}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.health.detailNextDue')}</span
							>
							<span class="text-foreground"><LocalTime date={h.nextDueAt} format="datetime" /></span
							>
						</div>
					{/if}
					{#if h.vetName || h.vetClinic}
						<div class="flex items-center gap-3">
							<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
								>{t(locale, 'page.health.detailVet')}</span
							>
							<span class="text-foreground"
								>{[h.vetName, h.vetClinic].filter(Boolean).join(', ')}</span
							>
						</div>
					{/if}
					{#if h.notes}
						<div class="pt-1">
							<p class="text-xs font-medium text-muted-foreground mb-1">
								{t(locale, 'page.health.detailNotes')}
							</p>
							<div class="prose prose-sm dark:prose-invert max-w-none">
								{@html renderMarkdown(h.notes)}
							</div>
						</div>
					{/if}
				{/if}
			</div>

			<Separator />

			{#if data.companion.isActive !== false}
				<div class="flex gap-2 px-5 py-4">
					{#if selected.kind === 'weight'}
						<Button
							variant="outline"
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
							variant="destructive"
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
					{:else if selected.kind === 'health'}
						<Button
							variant="outline"
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
							variant="destructive"
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
				</div>
			{/if}
		</div>
	</div>
{/if}

<div class="space-y-6 pb-20 md:pb-0">
	{#if !data.companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.health.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<div class="flex items-center justify-between">
		<h1 class="font-display text-2xl font-bold text-foreground">
			{t(locale, 'page.health.title')}
		</h1>
		{#if data.companion.isActive !== false}
			<div class="flex gap-2">
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
					}}
				>
					<Plus class="h-4 w-4 mr-1.5" />
					{t(locale, 'page.health.addEvent')}
				</Button>
			</div>
		{/if}
	</div>

	{#if form?.healthError || form?.weightError}
		<Alert variant="destructive">
			<AlertDescription>{form.healthError ?? form.weightError}</AlertDescription>
		</Alert>
	{/if}

	{#if showHealthForm}
		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.health.newHealthEventTitle')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					method="POST"
					action="?/addHealth"
					use:localDatetimes
					use:enhance={() => {
						submittingHealth = true;
						return async ({ update }) => {
							await update();
							submittingHealth = false;
							showHealthForm = false;
						};
					}}
					class="space-y-4"
				>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="title">{t(locale, 'page.health.labelTitle')}</Label>
							<Input
								id="title"
								name="title"
								type="text"
								autocomplete="off"
								placeholder={t(locale, 'page.health.placeholderTitle')}
								required
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="type">{t(locale, 'page.health.labelType')}</Label>
							<Select id="type" name="type" required>
								{#each HEALTH_TYPES as ht (ht.value)}
									<option value={ht.value}>{ht.label}</option>
								{/each}
							</Select>
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="occurredAt">{t(locale, 'page.health.labelDate')}</Label>
							<Input
								id="occurredAt"
								name="occurredAt"
								type="datetime-local"
								autocomplete="off"
								value={todayISO}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="nextDueAt">{t(locale, 'page.health.labelNextDue')}</Label>
							<Input id="nextDueAt" name="nextDueAt" type="datetime-local" autocomplete="off" />
						</div>
					</div>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="vetName">{t(locale, 'page.health.labelVetName')}</Label>
							<Input
								id="vetName"
								name="vetName"
								type="text"
								autocomplete="off"
								placeholder={t(locale, 'page.health.placeholderVetName')}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="vetClinic">{t(locale, 'page.health.labelClinic')}</Label>
							<Input
								id="vetClinic"
								name="vetClinic"
								type="text"
								autocomplete="off"
								placeholder={t(locale, 'page.health.placeholderClinic')}
							/>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="notes">{t(locale, 'page.health.labelNotes')}</Label>
						<MarkdownTextarea
							id="notes"
							name="notes"
							placeholder={t(locale, 'page.health.placeholderNotes')}
							rows={4}
						/>
					</div>
					<div class="flex gap-3">
						<Button type="submit" disabled={submittingHealth}>
							{submittingHealth
								? t(locale, 'page.health.savingEvent')
								: t(locale, 'page.health.saveEvent')}
						</Button>
						<Button type="button" variant="outline" onclick={() => (showHealthForm = false)}
							>{t(locale, 'common.cancel')}</Button
						>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}

	{#if showWeightForm}
		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.health.logWeightTitle')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					method="POST"
					action="?/addWeight"
					use:localDatetimes
					use:enhance={() => {
						submittingWeight = true;
						return async ({ update }) => {
							await update();
							submittingWeight = false;
							showWeightForm = false;
						};
					}}
					class="space-y-4"
				>
					<div class="grid grid-cols-3 gap-4">
						<div class="space-y-1.5 col-span-2">
							<Label for="weight">{t(locale, 'page.health.labelWeight')}</Label>
							<Input
								id="weight"
								name="weight"
								type="number"
								step="0.1"
								min="0"
								autocomplete="off"
								placeholder={t(locale, 'page.health.placeholderWeight')}
								required
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="unit">{t(locale, 'page.health.labelUnit')}</Label>
							<Select id="unit" name="unit">
								<option value={data.companion.weightUnit}>{data.companion.weightUnit}</option>
								<option value={data.companion.weightUnit === 'lbs' ? 'kg' : 'lbs'}>
									{data.companion.weightUnit === 'lbs' ? 'kg' : 'lbs'}
								</option>
							</Select>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="recordedAt">{t(locale, 'page.health.labelRecordedAt')}</Label>
						<Input
							id="recordedAt"
							name="recordedAt"
							type="datetime-local"
							autocomplete="off"
							value={todayISO}
						/>
					</div>
					<div class="space-y-1.5">
						<Label for="weightNotes">{t(locale, 'page.health.labelNotes')}</Label>
						<MarkdownTextarea
							id="weightNotes"
							name="notes"
							placeholder={t(locale, 'page.health.placeholderWeightNotes')}
							rows={3}
						/>
					</div>
					<div class="flex gap-3">
						<Button type="submit" disabled={submittingWeight}>
							{submittingWeight
								? t(locale, 'page.health.savingWeight')
								: t(locale, 'page.health.logWeightSubmit')}
						</Button>
						<Button type="button" variant="outline" onclick={() => (showWeightForm = false)}
							>{t(locale, 'common.cancel')}</Button
						>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}

	{#if data.weightEntries.length > 0}
		<Card>
			<CardHeader>
				<CardTitle>{t(locale, 'page.health.weightHistoryTitle')}</CardTitle>
			</CardHeader>
			<div class="divide-y divide-border">
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
											<option value="lbs" selected={entry.unit === 'lbs'}>lbs</option>
											<option value="kg" selected={entry.unit === 'kg'}>kg</option>
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
						<div class="flex items-center gap-4 px-6 py-3 text-sm group">
							<button
								type="button"
								onclick={() => openDetail({ kind: 'weight', item: entry })}
								class="flex-1 flex items-center gap-4 text-sm text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors min-w-0"
							>
								<span class="w-24 shrink-0 text-xs whitespace-nowrap text-muted-foreground"
									><LocalTime date={entry.recordedAt} /></span
								>
								<span class="w-20 shrink-0 font-semibold text-foreground"
									>{entry.weight} {entry.unit}</span
								>
								<span class="flex-1 min-w-0 text-xs text-muted-foreground">
									<span class="truncate block"
										>{entry.notes ? entry.notes.replace(/[#*_`~>[\]]/g, '').trim() : ''}</span
									>
									{#if entry.logger}
										<span class="block opacity-60"
											>{t(locale, 'common.loggedBy', { name: entry.logger.displayName })}</span
										>
									{/if}
								</span>
							</button>
							{#if data.companion.isActive !== false}
								<div class="flex gap-1 shrink-0">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onclick={() => startEditWeight(entry)}
										class="h-7 gap-1.5 px-2 text-xs"
									>
										<Pencil class="h-3.5 w-3.5" />
										<span class="hidden sm:inline">{t(locale, 'common.edit')}</span>
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										class="h-7 gap-1.5 px-2 text-xs hover:text-red-500 dark:hover:text-red-400"
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
		</Card>
	{/if}

	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.health.healthEventsTitle')}</CardTitle>
		</CardHeader>
		<CardContent>
			{#if data.healthEvents.length === 0}
				<p class="text-sm italic text-muted-foreground">
					{t(locale, 'page.health.noHealthEvents')}
				</p>
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
									<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
										<div class="space-y-1.5">
											<Label for="edit-nextDueAt-{event.id}"
												>{t(locale, 'page.health.labelNextDue')}</Label
											>
											<Input
												id="edit-nextDueAt-{event.id}"
												name="nextDueAt"
												type="datetime-local"
												autocomplete="off"
												value={event.nextDueAt ? localDatetimeISO(event.nextDueAt) : ''}
											/>
										</div>
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
							<div class="flex items-start gap-4 py-2 border-b border-border last:border-0">
								<button
									type="button"
									onclick={() => openDetail({ kind: 'health', item: event })}
									class="flex-1 flex items-start gap-4 text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors min-w-0"
								>
									<div class="shrink-0 text-right w-20">
										<span class="text-xs text-muted-foreground"
											><LocalTime date={event.occurredAt} /></span
										>
									</div>
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-2">
											<Badge variant="bark" class="capitalize"
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
												{event.notes.replace(/[#*_`~>[\]]/g, '').trim()}
											</p>
										{/if}
										{#if event.nextDueAt}
											<p class="text-xs mt-1 text-primary">
												📅 {t(locale, 'page.health.nextDueLabel')}
												<LocalTime date={event.nextDueAt} />
											</p>
										{/if}
										{#if event.logger}
											<p class="text-xs mt-0.5 text-muted-foreground opacity-60">
												{t(locale, 'common.loggedBy', { name: event.logger.displayName })}
											</p>
										{/if}
									</div>
								</button>
								{#if data.companion.isActive !== false}
									<div class="flex gap-1 shrink-0">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => startEditHealth(event)}
											class="h-7 gap-1.5 px-2 text-xs"
										>
											<Pencil class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">{t(locale, 'common.edit')}</span>
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 gap-1.5 px-2 text-xs hover:text-red-500 dark:hover:text-red-400"
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
		</CardContent>
	</Card>
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
