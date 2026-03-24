<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Plus, Pencil, Trash2, BellOff, RotateCcw, X } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { localDatetimes } from '$lib/actions/localDatetimes';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showForm = $state(false);
	let isRecurring = $state(false);
	let submitting = $state(false);

	const REMINDER_TYPES = [
		{ value: 'vet', label: '🏥 Vet' },
		{ value: 'medication', label: '💊 Medication' },
		{ value: 'vaccination', label: '💉 Vaccination' },
		{ value: 'grooming', label: '✂️ Grooming' },
		{ value: 'other', label: '📌 Other' }
	];

	let active = $derived(data.reminders.filter((r) => !r.isDismissed));
	let dismissed = $derived(data.reminders.filter((r) => r.isDismissed));

	function isOverdue(dueAt: Date | string) {
		return new Date(dueAt) < new Date();
	}

	function localDatetimeISO(d: Date | string) {
		const dt = new Date(d);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
	}

	let editingId = $state<string | null>(null);
	let editIsRecurring = $state(false);

	$effect(() => {
		const editId = page.url.searchParams.get('edit');
		if (!editId || !data.reminders.length) return;
		const match = data.reminders.find((r) => r.id === editId);
		if (match) {
			tick().then(() => startEdit(match));
		}
	});

	function startEdit(reminder: (typeof data.reminders)[0]) {
		editingId = reminder.id;
		editIsRecurring = reminder.isRecurring;
	}

	const TYPE_ICONS: Record<string, string> = {
		vet: '🏥',
		medication: '💊',
		vaccination: '💉',
		grooming: '✂️',
		other: '📌'
	};

	let confirmOpen = $state(false);
	let deleteReminderId = $state('');
	let deleteReminderForm = $state<HTMLFormElement | null>(null);

	// Detail modal
	let selected = $state<(typeof data.reminders)[0] | null>(null);
	let dialogEl = $state<HTMLElement | null>(null);
	let modalDismissForm = $state<HTMLFormElement | null>(null);

	async function openDetail(reminder: (typeof data.reminders)[0]) {
		selected = reminder;
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
	<title>Reminders | {data.companion.name} | EinVault</title>
</svelte:head>

<!-- Detail modal -->
{#if selected}
	{@const r = selected}
	{@const overdue = isOverdue(r.dueAt)}
	<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
		<button
			tabindex="-1"
			class="absolute inset-0 bg-black/50 backdrop-blur-sm"
			aria-label="Close dialog"
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
				<h2 class="font-semibold text-base text-foreground">{r.title}</h2>
				<button
					onclick={closeDetail}
					aria-label="Close"
					class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<Separator />

			<div class="px-5 py-4 space-y-3 text-sm">
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Type</span>
					<Badge variant="secondary" class="capitalize">{r.type}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Due</span>
					<span class={overdue ? 'text-destructive' : 'text-foreground'}>
						<LocalTime date={r.dueAt} format="datetime" />
					</span>
					{#if overdue}<Badge variant="destructive" class="ml-1">Overdue</Badge>{/if}
				</div>
				{#if r.isRecurring && r.recurringDays}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground">Repeats</span>
						<span class="text-foreground"
							>Every {r.recurringDays} day{r.recurringDays !== 1 ? 's' : ''}</span
						>
					</div>
				{/if}
				{#if r.description}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">Notes</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(r.description)}
						</div>
					</div>
				{/if}
			</div>

			<Separator />

			{#if data.companion.isActive !== false}
				<div class="flex gap-2 px-5 py-4">
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							if (selected) {
								const item = selected;
								closeDetail();
								startEdit(item);
							}
						}}
					>
						<Pencil class="h-3.5 w-3.5 mr-1.5" />
						Edit
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={() => {
							closeDetail();
							modalDismissForm?.requestSubmit();
						}}
					>
						<BellOff class="h-3.5 w-3.5 mr-1.5" />
						Dismiss
					</Button>
					<Button
						variant="destructive"
						size="sm"
						onclick={() => {
							const item = r;
							closeDetail();
							deleteReminderId = item.id;
							confirmOpen = true;
						}}
					>
						<Trash2 class="h-3.5 w-3.5 mr-1.5" />
						Delete
					</Button>
				</div>
			{/if}
		</div>
	</div>
	<!-- Hidden dismiss form for modal action -->
	<form bind:this={modalDismissForm} method="POST" action="?/dismiss" use:enhance class="hidden">
		<input type="hidden" name="id" value={r.id} />
	</form>
{/if}

<div class="space-y-6 pb-20 md:pb-0">
	{#if !data.companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{data.companion.name} is archived. Viewing in read-only mode.
		</div>
	{/if}

	<div class="flex items-center justify-between">
		<h1 class="font-display text-2xl font-bold text-foreground">Reminders</h1>
		{#if data.companion.isActive !== false}
			<Button size="sm" onclick={() => (showForm = !showForm)}>
				{#if showForm}
					Cancel
				{:else}
					<Plus class="h-4 w-4 mr-1.5" />
					Add Reminder
				{/if}
			</Button>
		{/if}
	</div>

	{#if form?.error}
		<Alert variant="destructive">
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if showForm}
		<Card class="animate-slide-up">
			<CardContent class="pt-6">
				<h2 class="font-semibold text-foreground mb-4">New reminder</h2>
				<form
					method="POST"
					action="?/add"
					use:localDatetimes
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update();
							submitting = false;
							showForm = false;
						};
					}}
					class="space-y-4"
				>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5 col-span-2 sm:col-span-1">
							<Label for="title">Title *</Label>
							<Input
								id="title"
								name="title"
								type="text"
								placeholder="e.g. Annual booster"
								required
								autocomplete="off"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="type">Type</Label>
							<Select id="type" name="type">
								{#each REMINDER_TYPES as t (t.value)}
									<option value={t.value}>{t.label}</option>
								{/each}
							</Select>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="dueAt">Due date *</Label>
						<Input id="dueAt" name="dueAt" type="datetime-local" required autocomplete="off" />
					</div>
					<div class="space-y-1.5">
						<Label for="description">Notes</Label>
						<MarkdownTextarea
							id="description"
							name="description"
							placeholder="Any additional details…"
							rows={3}
						/>
					</div>
					<label class="flex items-center gap-2 cursor-pointer">
						<input
							id="isRecurring"
							type="checkbox"
							name="isRecurring"
							bind:checked={isRecurring}
							class="rounded border-input"
						/>
						<span class="text-sm text-foreground">Recurring reminder</span>
					</label>
					{#if isRecurring}
						<div class="space-y-1.5 animate-slide-up">
							<Label for="recurringDays">Repeat every (days)</Label>
							<Input
								id="recurringDays"
								name="recurringDays"
								type="number"
								min="1"
								class="max-w-[120px]"
								placeholder="30"
								required
								autocomplete="off"
							/>
						</div>
					{/if}
					<div class="flex gap-3">
						<Button type="submit" disabled={submitting}>
							{submitting ? 'Saving...' : 'Save Reminder'}
						</Button>
						<Button type="button" variant="outline" onclick={() => (showForm = false)}
							>Cancel</Button
						>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}

	{#if active.length === 0}
		<Card>
			<CardContent class="text-center py-12">
				<p class="text-4xl mb-3">🔔</p>
				<p class="text-sm italic text-muted-foreground">No upcoming reminders.</p>
			</CardContent>
		</Card>
	{:else}
		<div class="space-y-3">
			{#each active as reminder (reminder.id)}
				{@const overdue = isOverdue(reminder.dueAt)}
				<Card class={overdue ? 'border-red-300 dark:border-red-800' : ''}>
					{#if editingId === reminder.id}
						<CardContent class="pt-6">
							<form
								method="POST"
								action="?/update"
								use:localDatetimes
								use:enhance={() =>
									({ update }) => {
										update();
										editingId = null;
									}}
								class="space-y-4"
							>
								<input type="hidden" name="id" value={reminder.id} />
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-1.5 col-span-2 sm:col-span-1">
										<Label for="edit-title-{reminder.id}">Title *</Label>
										<Input
											id="edit-title-{reminder.id}"
											name="title"
											type="text"
											autocomplete="off"
											value={reminder.title}
											required
										/>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-type-{reminder.id}">Type</Label>
										<Select id="edit-type-{reminder.id}" name="type">
											{#each REMINDER_TYPES as t (t.value)}
												<option value={t.value} selected={reminder.type === t.value}
													>{t.label}</option
												>
											{/each}
										</Select>
									</div>
								</div>
								<div class="space-y-1.5">
									<Label for="edit-dueAt-{reminder.id}">Due date *</Label>
									<Input
										id="edit-dueAt-{reminder.id}"
										name="dueAt"
										type="datetime-local"
										autocomplete="off"
										value={localDatetimeISO(reminder.dueAt)}
										required
									/>
								</div>
								<div class="space-y-1.5">
									<Label for="edit-description-{reminder.id}">Notes</Label>
									<MarkdownTextarea
										id="edit-description-{reminder.id}"
										name="description"
										value={reminder.description ?? ''}
										placeholder="Any additional details…"
										rows={3}
									/>
								</div>
								<label class="flex items-center gap-2 cursor-pointer">
									<input
										id="edit-isRecurring-{reminder.id}"
										type="checkbox"
										name="isRecurring"
										bind:checked={editIsRecurring}
										class="rounded border-input"
									/>
									<span class="text-sm text-foreground">Recurring reminder</span>
								</label>
								{#if editIsRecurring}
									<div class="space-y-1.5">
										<Label for="edit-recurringDays-{reminder.id}">Repeat every (days)</Label>
										<Input
											id="edit-recurringDays-{reminder.id}"
											name="recurringDays"
											type="number"
											min="1"
											class="max-w-[120px]"
											autocomplete="off"
											value={reminder.recurringDays ?? ''}
											placeholder="30"
											required
										/>
									</div>
								{/if}
								<div class="flex gap-3">
									<Button type="submit" size="sm">Save</Button>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => (editingId = null)}>Cancel</Button
									>
								</div>
							</form>
						</CardContent>
					{:else}
						<CardContent class="pt-4 pb-4">
							<div class="flex items-start justify-between gap-4">
								<button
									type="button"
									onclick={() => openDetail(reminder)}
									class="flex-1 flex items-start gap-3 text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors min-w-0"
								>
									<span class="text-xl mt-0.5">{TYPE_ICONS[reminder.type] ?? '📌'}</span>
									<div class="min-w-0">
										<div class="flex items-center gap-2 flex-wrap">
											<span class="font-medium text-foreground">{reminder.title}</span>
											{#if overdue}<Badge variant="destructive">Overdue</Badge>{/if}
											{#if reminder.isRecurring && reminder.recurringDays}
												<Badge variant="secondary">Every {reminder.recurringDays}d</Badge>
											{/if}
										</div>
										{#if reminder.description}
											<div
												class="prose prose-sm dark:prose-invert max-w-none mt-0.5 text-muted-foreground"
											>
												{@html renderMarkdown(reminder.description)}
											</div>
										{/if}
										<p
											class="text-xs mt-1 {overdue ? 'text-destructive' : 'text-muted-foreground'}"
										>
											Due <LocalTime date={reminder.dueAt} format="datetime" />
										</p>
									</div>
								</button>
								{#if data.companion.isActive !== false}
									<div class="flex gap-1 shrink-0">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => startEdit(reminder)}
											class="h-7 gap-1.5 px-2 text-xs"
										>
											<Pencil class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">Edit</span>
										</Button>
										<form method="POST" action="?/dismiss" use:enhance>
											<input type="hidden" name="id" value={reminder.id} />
											<Button
												type="submit"
												variant="ghost"
												size="sm"
												class="h-7 gap-1.5 px-2 text-xs"
											>
												<BellOff class="h-3.5 w-3.5" />
												<span class="hidden sm:inline">Dismiss</span>
											</Button>
										</form>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 gap-1.5 px-2 text-xs hover:text-red-500 dark:hover:text-red-400"
											onclick={() => {
												deleteReminderId = reminder.id;
												confirmOpen = true;
											}}
										>
											<Trash2 class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">Delete</span>
										</Button>
									</div>
								{/if}
							</div>
						</CardContent>
					{/if}
				</Card>
			{/each}
		</div>
	{/if}

	{#if dismissed.length > 0}
		<details>
			<summary class="cursor-pointer text-sm select-none hover:opacity-80 text-muted-foreground">
				{dismissed.length} dismissed reminder{dismissed.length !== 1 ? 's' : ''}
			</summary>
			<div class="mt-3 space-y-2">
				{#each dismissed as reminder (reminder.id)}
					<Card class={editingId !== reminder.id ? 'opacity-60' : ''}>
						{#if editingId === reminder.id}
							<CardContent class="pt-6">
								<form
									method="POST"
									action="?/update"
									use:localDatetimes
									use:enhance={() =>
										({ update }) => {
											update();
											editingId = null;
										}}
									class="space-y-4"
								>
									<input type="hidden" name="id" value={reminder.id} />
									<div class="grid grid-cols-2 gap-4">
										<div class="space-y-1.5 col-span-2 sm:col-span-1">
											<Label for="edit-title-{reminder.id}">Title *</Label>
											<Input
												id="edit-title-{reminder.id}"
												name="title"
												type="text"
												autocomplete="off"
												value={reminder.title}
												required
											/>
										</div>
										<div class="space-y-1.5">
											<Label for="edit-type-{reminder.id}">Type</Label>
											<Select id="edit-type-{reminder.id}" name="type">
												{#each REMINDER_TYPES as t (t.value)}
													<option value={t.value} selected={reminder.type === t.value}
														>{t.label}</option
													>
												{/each}
											</Select>
										</div>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-dueAt-{reminder.id}">Due date *</Label>
										<Input
											id="edit-dueAt-{reminder.id}"
											name="dueAt"
											type="datetime-local"
											autocomplete="off"
											value={localDatetimeISO(reminder.dueAt)}
											required
										/>
									</div>
									<div class="space-y-1.5">
										<Label for="edit-description-{reminder.id}">Notes</Label>
										<MarkdownTextarea
											id="edit-description-{reminder.id}"
											name="description"
											value={reminder.description ?? ''}
											placeholder="Any additional details…"
											rows={3}
										/>
									</div>
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											id="edit-isRecurring-{reminder.id}"
											type="checkbox"
											name="isRecurring"
											bind:checked={editIsRecurring}
											class="rounded border-input"
										/>
										<span class="text-sm text-foreground">Recurring reminder</span>
									</label>
									{#if editIsRecurring}
										<div class="space-y-1.5">
											<Label for="edit-recurringDays-{reminder.id}">Repeat every (days)</Label>
											<Input
												id="edit-recurringDays-{reminder.id}"
												name="recurringDays"
												type="number"
												min="1"
												class="max-w-[120px]"
												autocomplete="off"
												value={reminder.recurringDays ?? ''}
												placeholder="30"
												required
											/>
										</div>
									{/if}
									<div class="flex gap-3">
										<Button type="submit" size="sm">Save</Button>
										<Button
											type="button"
											variant="outline"
											size="sm"
											onclick={() => (editingId = null)}>Cancel</Button
										>
									</div>
								</form>
							</CardContent>
						{:else}
							<CardContent class="py-3">
								<div class="flex items-center justify-between gap-4">
									<div class="flex items-center gap-2 text-sm">
										<span>{TYPE_ICONS[reminder.type] ?? '📌'}</span>
										<span class="line-through text-muted-foreground">{reminder.title}</span>
										<span class="text-xs text-muted-foreground"
											><LocalTime date={reminder.dueAt} /></span
										>
									</div>
									<div class="flex gap-1 shrink-0">
										<Button
											type="button"
											variant="ghost"
											size="sm"
											onclick={() => startEdit(reminder)}
											class="h-7 gap-1.5 px-2 text-xs"
										>
											<Pencil class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">Edit</span>
										</Button>
										<form method="POST" action="?/undismiss" use:enhance>
											<input type="hidden" name="id" value={reminder.id} />
											<Button
												type="submit"
												variant="ghost"
												size="sm"
												class="h-7 gap-1.5 px-2 text-xs"
											>
												<RotateCcw class="h-3.5 w-3.5" />
												<span class="hidden sm:inline">Restore</span>
											</Button>
										</form>
										<Button
											type="button"
											variant="ghost"
											size="sm"
											class="h-7 gap-1.5 px-2 text-xs hover:text-red-500 dark:hover:text-red-400"
											onclick={() => {
												deleteReminderId = reminder.id;
												confirmOpen = true;
											}}
										>
											<Trash2 class="h-3.5 w-3.5" />
											<span class="hidden sm:inline">Delete</span>
										</Button>
									</div>
								</div>
							</CardContent>
						{/if}
					</Card>
				{/each}
			</div>
		</details>
	{/if}
</div>

<form bind:this={deleteReminderForm} method="POST" action="?/delete" use:enhance class="hidden">
	<input type="hidden" name="id" value={deleteReminderId} />
</form>

<ConfirmDialog
	open={confirmOpen}
	message="This can't be undone."
	onconfirm={() => {
		confirmOpen = false;
		deleteReminderForm?.requestSubmit();
	}}
	oncancel={() => (confirmOpen = false)}
/>
