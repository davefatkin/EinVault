<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import {
		ArrowDown,
		ArrowUp,
		Check,
		Pencil,
		Plus,
		Power,
		PowerOff,
		Share2,
		Trash2,
		Zap
	} from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import ActivityTypePills from '$lib/components/log/ActivityTypePills.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { ACTIVITY_ICONS, ACTIVITY_HAS_DURATION, activityLabel } from '$lib/i18n/labels';

	interface QuickLogRow {
		id: string;
		name: string;
		type: string;
		durationMinutes: number | null;
		note: string | null;
		isEnabled: boolean;
		companions: { companionId: string }[];
	}
	interface CompanionOption {
		id: string;
		name: string;
	}
	interface UserOption {
		id: string;
		displayName: string;
	}

	let {
		quickLogs,
		companions,
		shareableUsers,
		form
	}: {
		quickLogs: QuickLogRow[];
		companions: CompanionOption[];
		shareableUsers: UserOption[];
		form: {
			quickLogSaved?: boolean;
			quickLogDeleted?: boolean;
			quickLogShared?: number;
			quickLogError?: string;
		} | null;
	} = $props();

	const locale = getLocale();

	// Which panel is open: the create editor, an edit editor, or a share picker.
	let editorOpen = $state<'create' | string | null>(null);
	let shareOpen = $state<string | null>(null);

	// Editor state, seeded when opening.
	let editName = $state('');
	let editType = $state('walk');
	let editDuration = $state('');
	let editNote = $state('');
	let editEnabled = $state(true);
	let editCompanionIds = $state<string[]>([]);
	let shareRecipientIds = $state<string[]>([]);

	let editHasDuration = $derived(ACTIVITY_HAS_DURATION[editType] ?? false);

	function openCreate() {
		editorOpen = 'create';
		shareOpen = null;
		editName = '';
		editType = 'walk';
		editDuration = '';
		editNote = '';
		editEnabled = true;
		editCompanionIds = companions.map((c) => c.id);
	}

	function openEdit(row: QuickLogRow) {
		editorOpen = row.id;
		shareOpen = null;
		editName = row.name;
		editType = row.type;
		editDuration = row.durationMinutes ? String(row.durationMinutes) : '';
		editNote = row.note ?? '';
		editEnabled = row.isEnabled;
		editCompanionIds = row.companions.map((c) => c.companionId);
	}

	function openShare(id: string) {
		shareOpen = shareOpen === id ? null : id;
		editorOpen = null;
		shareRecipientIds = [];
	}

	// After a ?/move re-render, focus drops to <body>. Restore focus to the moved
	// row's reorder control so keyboard/AT users keep their place (WCAG 2.4.3).
	function restoreMoveFocus(id: string, dir: 'up' | 'down') {
		const primary = document.querySelector<HTMLButtonElement>(`[data-move="${id}:${dir}"]`);
		if (primary && !primary.disabled) {
			primary.focus();
			return;
		}
		const other = dir === 'up' ? 'down' : 'up';
		document.querySelector<HTMLButtonElement>(`[data-move="${id}:${other}"]`)?.focus();
	}

	const moveEnhance = (id: string, dir: 'up' | 'down') => {
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			restoreMoveFocus(id, dir);
		};
	};

	const closeOnSuccess = () => {
		return async ({
			result,
			update
		}: {
			result: { type: string };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			await update({ reset: false });
			if (result.type === 'success') {
				editorOpen = null;
				shareOpen = null;
			}
		};
	};
</script>

{#snippet editorForm(action: string, id: string | null)}
	<form method="POST" {action} use:enhance={closeOnSuccess} class="space-y-4 pt-4">
		{#if id}
			<input type="hidden" name="id" value={id} />
		{/if}
		<input type="hidden" name="isEnabled" value={editEnabled ? 'true' : 'false'} />

		<div class="space-y-1.5">
			<Label for="ql-name">{t(locale, 'quickLogs.nameLabel')}</Label>
			<Input
				id="ql-name"
				name="name"
				value={editName}
				oninput={(e: Event) => (editName = (e.currentTarget as HTMLInputElement).value)}
				maxlength={60}
				required
				placeholder={t(locale, 'quickLogs.namePlaceholder')}
			/>
		</div>

		<ActivityTypePills bind:selected={editType} legend={t(locale, 'quickLogs.typeLabel')} />

		{#if editHasDuration}
			<div class="space-y-1.5 animate-slide-up">
				<Label for="ql-duration">{t(locale, 'page.log.durationLabel')}</Label>
				<input
					id="ql-duration"
					name="durationMinutes"
					type="number"
					min="1"
					max="480"
					autocomplete="off"
					bind:value={editDuration}
					class="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					placeholder="30"
				/>
			</div>
		{/if}

		<div class="space-y-1.5">
			<Label for="ql-note"
				>{t(locale, 'quickLogs.noteLabel')}
				<span class="font-normal text-muted-foreground">{t(locale, 'page.log.notesOptional')}</span
				></Label
			>
			<Textarea
				id="ql-note"
				name="note"
				value={editNote}
				oninput={(e: Event) => (editNote = (e.currentTarget as HTMLTextAreaElement).value)}
				rows={2}
				placeholder={t(locale, 'quickLogs.notePlaceholder')}
			/>
		</div>

		<fieldset class="space-y-1.5">
			<legend class="text-sm font-medium text-foreground"
				>{t(locale, 'quickLogs.companionsLabel')}</legend
			>
			<div class="flex flex-wrap gap-2">
				{#each companions as companion (companion.id)}
					{@const checked = editCompanionIds.includes(companion.id)}
					<label class="cursor-pointer">
						<input
							type="checkbox"
							name="companionIds"
							value={companion.id}
							bind:group={editCompanionIds}
							class="sr-only peer"
						/>
						<span
							class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
							peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
							{checked
								? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
								: 'border-border text-muted-foreground hover:text-foreground'}"
						>
							{#if checked}
								<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
							{/if}
							{companion.name}
						</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={editEnabled} class="h-4 w-4 accent-primary" />
			{t(locale, 'quickLogs.enabledLabel')}
		</label>

		<div class="flex gap-2">
			<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
			<Button type="button" variant="outline" size="sm" onclick={() => (editorOpen = null)}>
				{t(locale, 'common.cancel')}
			</Button>
		</div>
	</form>
{/snippet}

<div class="space-y-4">
	{#if form?.quickLogError}
		<div
			role="alert"
			class="rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm text-coral"
		>
			{form.quickLogError}
		</div>
	{/if}
	{#if form?.quickLogShared}
		<div
			role="status"
			class="rounded-lg border border-teal/30 bg-teal/10 px-4 py-3 text-sm text-teal"
		>
			{t(locale, 'quickLogs.shareSuccess', { count: String(form.quickLogShared) })}
		</div>
	{/if}

	{#if quickLogs.length === 0 && editorOpen !== 'create'}
		<Card>
			<CardContent class="py-6">
				<EmptyState
					tint="primary"
					title={t(locale, 'quickLogs.empty')}
					body={t(locale, 'quickLogs.emptyBody')}
				>
					{#snippet icon()}<Zap class="h-5 w-5" />{/snippet}
					{#snippet action()}
						<Button size="sm" onclick={openCreate}>
							{t(locale, 'quickLogs.addButton')}
						</Button>
					{/snippet}
				</EmptyState>
			</CardContent>
		</Card>
	{:else}
		<div class="divide-y divide-border rounded-xl border bg-card">
			{#each quickLogs as row, i (row.id)}
				<div class="px-4 py-3">
					<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
						<div class="flex min-w-0 items-center gap-3 sm:flex-1">
							<span
								class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gold/15 text-lg"
								>{ACTIVITY_ICONS[row.type] ?? '📝'}</span
							>
							<div class="flex-1 min-w-0">
								<p class="font-medium truncate {row.isEnabled ? '' : 'text-muted-foreground'}">
									{row.name}
									{#if !row.isEnabled}
										<Badge variant="outline" class="ml-1 align-middle">
											{t(locale, 'quickLogs.disabledBadge')}
										</Badge>
									{/if}
								</p>
								<p class="text-xs text-muted-foreground truncate">
									{activityLabel(locale, row.type)}
									{#if row.durationMinutes}
										· {row.durationMinutes} min
									{/if}
									· {t(locale, 'quickLogs.companionCount', {
										count: String(row.companions.length)
									})}
								</p>
							</div>
						</div>

						<div class="flex flex-wrap items-center gap-1 sm:shrink-0">
							<form method="POST" action="?/move" use:enhance={() => moveEnhance(row.id, 'up')}>
								<input type="hidden" name="id" value={row.id} />
								<input type="hidden" name="dir" value="up" />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									data-move="{row.id}:up"
									disabled={i === 0}
									aria-label={t(locale, 'quickLogs.moveUpPosition', {
										name: row.name,
										position: i + 1,
										total: quickLogs.length
									})}
								>
									<ArrowUp class="h-4 w-4" />
								</Button>
							</form>
							<form method="POST" action="?/move" use:enhance={() => moveEnhance(row.id, 'down')}>
								<input type="hidden" name="id" value={row.id} />
								<input type="hidden" name="dir" value="down" />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									data-move="{row.id}:down"
									disabled={i === quickLogs.length - 1}
									aria-label={t(locale, 'quickLogs.moveDownPosition', {
										name: row.name,
										position: i + 1,
										total: quickLogs.length
									})}
								>
									<ArrowDown class="h-4 w-4" />
								</Button>
							</form>
							<form method="POST" action="?/toggle" use:enhance>
								<input type="hidden" name="id" value={row.id} />
								<input type="hidden" name="enabled" value={row.isEnabled ? 'false' : 'true'} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class={row.isEnabled ? '' : 'text-muted-foreground'}
									aria-label={row.isEnabled
										? t(locale, 'quickLogs.disable')
										: t(locale, 'quickLogs.enable')}
								>
									{#if row.isEnabled}
										<Power class="h-4 w-4" />
									{:else}
										<PowerOff class="h-4 w-4" />
									{/if}
								</Button>
							</form>
							{#if shareableUsers.length > 0}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									aria-label={t(locale, 'quickLogs.share')}
									onclick={() => openShare(row.id)}
								>
									<Share2 class="h-4 w-4" />
								</Button>
							{/if}
							<Button
								type="button"
								variant="ghost"
								size="icon"
								aria-label={t(locale, 'quickLogs.edit')}
								onclick={() => (editorOpen === row.id ? (editorOpen = null) : openEdit(row))}
							>
								<Pencil class="h-4 w-4" />
							</Button>
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="id" value={row.id} />
								<Button
									type="submit"
									variant="ghost"
									size="icon"
									class="text-muted-foreground hover:text-coral"
									aria-label={t(locale, 'quickLogs.delete')}
								>
									<Trash2 class="h-4 w-4" />
								</Button>
							</form>
						</div>
					</div>

					{#if editorOpen === row.id}
						{@render editorForm('?/update', row.id)}
					{/if}

					{#if shareOpen === row.id}
						<form
							method="POST"
							action="?/share"
							use:enhance={closeOnSuccess}
							class="pt-4 space-y-2"
						>
							<input type="hidden" name="id" value={row.id} />
							<p class="text-sm font-medium">{t(locale, 'quickLogs.shareTitle')}</p>
							<p class="text-xs text-muted-foreground">{t(locale, 'quickLogs.shareHint')}</p>
							<div class="flex flex-wrap gap-2">
								{#each shareableUsers as u (u.id)}
									{@const checked = shareRecipientIds.includes(u.id)}
									<label class="cursor-pointer">
										<input
											type="checkbox"
											name="recipientIds"
											value={u.id}
											bind:group={shareRecipientIds}
											class="sr-only peer"
										/>
										<span
											class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
											peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2
											{checked
												? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
												: 'border-border text-muted-foreground hover:text-foreground'}"
										>
											{#if checked}
												<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
											{/if}
											{u.displayName}
										</span>
									</label>
								{/each}
							</div>
							<Button type="submit" size="sm" disabled={shareRecipientIds.length === 0}>
								{t(locale, 'quickLogs.shareButton')}
							</Button>
						</form>
					{/if}
				</div>
			{/each}
		</div>

		{#if editorOpen !== 'create'}
			<Button variant="outline" size="sm" onclick={openCreate}>
				<Plus class="h-4 w-4 mr-1" />
				{t(locale, 'quickLogs.addButton')}
			</Button>
		{/if}
	{/if}

	{#if editorOpen === 'create'}
		<Card>
			<CardContent>
				{@render editorForm('?/create', null)}
			</CardContent>
		</Card>
	{/if}
</div>
