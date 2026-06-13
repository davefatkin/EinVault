<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Trash2, X } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';

	interface UserRow {
		id: string;
		displayName: string;
		username: string;
		email: string | null;
		phone: string | null;
		role: 'admin' | 'member' | 'caretaker';
		isActive: boolean;
	}
	interface CompanionRow {
		id: string;
		name: string;
		breed: string | null;
	}
	interface AssignmentRow {
		userId: string;
		companionId: string;
	}
	interface ShiftRow {
		id: string;
		userId: string;
		startAt: Date | string;
		endAt: Date | string;
		notes: string | null;
	}

	let {
		user,
		companions,
		assignments,
		shifts,
		currentUserId,
		onclose
	}: {
		user: UserRow;
		companions: CompanionRow[];
		assignments: AssignmentRow[];
		shifts: ShiftRow[];
		currentUserId: string;
		onclose: () => void;
	} = $props();

	const locale = getLocale();

	let editingShiftId = $state<string | null>(null);
	let confirmOpen = $state(false);
	let deleteShiftId = $state('');
	let deleteShiftForm = $state<HTMLFormElement | null>(null);

	let dialogEl = $state<HTMLElement | null>(null);
	let assignedIds = $derived(
		assignments.filter((a) => a.userId === user.id).map((a) => a.companionId)
	);
	let userShifts = $derived(shifts.filter((s) => s.userId === user.id));

	const roleBadge = { admin: 'primary', caretaker: 'teal', member: 'secondary' } as const;

	function localDatetimeISO(d: Date | string) {
		const dt = new Date(d);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
	}

	$effect(() => {
		tick().then(() => dialogEl?.focus());
	});

	function trapFocus(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
			return;
		}
		if (e.key !== 'Tab' || !dialogEl) return;
		const f = Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => !el.hasAttribute('disabled'));
		if (!f.length) return;
		const first = f[0];
		const last = f[f.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	const sectionLabel =
		'text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3';
</script>

<div class="fixed inset-0 z-50 flex justify-end">
	<button
		tabindex="-1"
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		aria-label={t(locale, 'common.close')}
		onclick={onclose}
	></button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'page.admin.editUserLabel', { name: user.displayName })}
		tabindex="-1"
		onkeydown={trapFocus}
		class="relative z-10 flex h-full w-full max-w-[380px] flex-col border-l border-border bg-card text-card-foreground shadow-2xl
			animate-in slide-in-from-right duration-200"
	>
		<div class="flex items-center gap-2 border-b border-border px-5 py-4">
			<Badge variant={roleBadge[user.role]}
				>{t(
					locale,
					user.role === 'admin'
						? 'enum.role.admin'
						: user.role === 'caretaker'
							? 'enum.role.caretaker'
							: 'enum.role.member'
				)}</Badge
			>
			<span class="font-semibold text-foreground truncate">{user.displayName}</span>
			<button
				onclick={onclose}
				aria-label={t(locale, 'common.close')}
				class="ml-auto rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<div class="flex-1 overflow-y-auto px-5 py-5 space-y-7">
			<!-- Profile (name/username/email/phone/role) -->
			<section>
				<h2 class={sectionLabel}>{t(locale, 'page.admin.drawerProfile')}</h2>
				<form
					method="POST"
					action="?/editUser"
					use:enhance={() =>
						({ result, update }) => {
							update();
							if (result.type === 'success') onclose();
						}}
					class="space-y-3"
				>
					<input type="hidden" name="userId" value={user.id} />
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label for="d-name-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.labelDisplayName')}</Label
							>
							<Input
								id="d-name-{user.id}"
								name="displayName"
								class="h-8 text-sm"
								autocomplete="name"
								value={user.displayName}
								required
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="d-username-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.labelUsername')}</Label
							>
							<Input
								id="d-username-{user.id}"
								name="username"
								class="h-8 text-sm"
								autocomplete="username"
								value={user.username}
								required
							/>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<div class="space-y-1.5">
							<Label for="d-email-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.labelEmail')}
								<span class="font-normal text-muted-foreground"
									>{t(locale, 'page.admin.labelOptional')}</span
								></Label
							>
							<Input
								id="d-email-{user.id}"
								name="email"
								type="email"
								class="h-8 text-sm"
								autocomplete="email"
								value={user.email ?? ''}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="d-phone-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.labelPhone')}
								<span class="font-normal text-muted-foreground"
									>{t(locale, 'page.admin.labelOptional')}</span
								></Label
							>
							<Input
								id="d-phone-{user.id}"
								name="phone"
								type="tel"
								class="h-8 text-sm"
								autocomplete="tel"
								value={user.phone ?? ''}
							/>
						</div>
					</div>
					<div class="space-y-1.5">
						<Label for="d-role-{user.id}" class="text-xs">{t(locale, 'page.admin.labelRole')}</Label
						>
						<Select id="d-role-{user.id}" name="role" class="h-8">
							<option value="member" selected={user.role === 'member'}
								>{t(locale, 'enum.role.member')}</option
							>
							<option value="admin" selected={user.role === 'admin'}
								>{t(locale, 'enum.role.admin')}</option
							>
							<option value="caretaker" selected={user.role === 'caretaker'}
								>{t(locale, 'enum.role.caretaker')}</option
							>
						</Select>
					</div>
					<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
				</form>
			</section>

			{#if user.role === 'caretaker'}
				<!-- Assigned companions -->
				<section>
					<h2 class={sectionLabel}>{t(locale, 'page.admin.menuCompanions')}</h2>
					<form
						method="POST"
						action="?/assignCompanions"
						use:enhance={() =>
							({ update }) =>
								update()}
						class="space-y-3"
					>
						<input type="hidden" name="userId" value={user.id} />
						{#if companions.length === 0}
							<p class="text-xs text-muted-foreground">
								{t(locale, 'page.admin.noActiveCompanions')}
							</p>
						{:else}
							<div class="space-y-2">
								{#each companions as companion (companion.id)}
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											type="checkbox"
											name="companionId"
											value={companion.id}
											checked={assignedIds.includes(companion.id)}
											class="rounded border-border"
										/>
										<span class="text-sm text-foreground">{companion.name}</span>
										{#if companion.breed}<span class="text-xs text-muted-foreground"
												>{companion.breed}</span
											>{/if}
									</label>
								{/each}
							</div>
						{/if}
						<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
					</form>
				</section>

				<!-- Shifts -->
				<section>
					<h2 class={sectionLabel}>{t(locale, 'page.admin.menuShifts')}</h2>
					{#if userShifts.length === 0}
						<p class="text-xs text-muted-foreground mb-3">
							{t(locale, 'page.admin.noShiftsScheduled')}
						</p>
					{:else}
						<div class="space-y-2 mb-3">
							{#each userShifts as shift (shift.id)}
								{#if editingShiftId === shift.id}
									<form
										method="POST"
										action="?/updateShift"
										use:localDatetimes
										use:enhance={() =>
											({ update }) => {
												update();
												editingShiftId = null;
											}}
										class="space-y-3 rounded-lg border border-border bg-background px-3 py-3"
									>
										<input type="hidden" name="shiftId" value={shift.id} />
										<div class="grid grid-cols-2 gap-3">
											<div class="space-y-1">
												<Label for="es-start-{shift.id}" class="text-xs"
													>{t(locale, 'page.admin.shiftLabelStart')}</Label
												>
												<Input
													id="es-start-{shift.id}"
													name="startAt"
													type="datetime-local"
													autocomplete="off"
													class="h-8 text-sm"
													value={localDatetimeISO(shift.startAt)}
													required
												/>
											</div>
											<div class="space-y-1">
												<Label for="es-end-{shift.id}" class="text-xs"
													>{t(locale, 'page.admin.shiftLabelEnd')}</Label
												>
												<Input
													id="es-end-{shift.id}"
													name="endAt"
													type="datetime-local"
													autocomplete="off"
													class="h-8 text-sm"
													value={localDatetimeISO(shift.endAt)}
													required
												/>
											</div>
										</div>
										<div class="space-y-1">
											<Label for="es-notes-{shift.id}" class="text-xs"
												>{t(locale, 'page.admin.shiftLabelLabel')}
												<span class="font-normal text-muted-foreground"
													>{t(locale, 'page.admin.labelOptional')}</span
												></Label
											>
											<Input
												id="es-notes-{shift.id}"
												name="notes"
												type="text"
												autocomplete="off"
												class="h-8 text-sm"
												value={shift.notes ?? ''}
												placeholder={t(locale, 'page.admin.shiftPlaceholder')}
											/>
										</div>
										<div class="flex gap-2">
											<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
											<Button
												type="button"
												variant="secondary"
												size="sm"
												onclick={() => (editingShiftId = null)}>{t(locale, 'common.cancel')}</Button
											>
										</div>
									</form>
								{:else}
									<div
										class="flex items-center justify-between gap-3 text-sm rounded-lg border border-border bg-background px-3 py-2"
									>
										<div class="min-w-0 text-foreground">
											<LocalTime date={shift.startAt} format="datetime" />
											<span class="mx-1 text-muted-foreground">→</span>
											<LocalTime date={shift.endAt} format="datetime" />
											{#if shift.notes}<span class="ml-2 text-xs text-muted-foreground"
													>{shift.notes}</span
												>{/if}
										</div>
										<div class="flex gap-1 shrink-0">
											<Button
												type="button"
												variant="soft"
												size="sm"
												class="h-7 text-xs"
												onclick={() => (editingShiftId = shift.id)}
												>{t(locale, 'common.edit')}</Button
											>
											<Button
												type="button"
												variant="softDestructive"
												size="sm"
												class="h-7 gap-1.5 px-2 text-xs"
												onclick={() => {
													deleteShiftId = shift.id;
													confirmOpen = true;
												}}
											>
												<Trash2 class="h-3.5 w-3.5" /><span class="hidden sm:inline"
													>{t(locale, 'common.delete')}</span
												>
											</Button>
										</div>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
					<form
						method="POST"
						action="?/addShift"
						use:localDatetimes
						use:enhance={() =>
							({ update }) =>
								update()}
						class="space-y-3 pt-3 border-t border-border"
					>
						<input type="hidden" name="userId" value={user.id} />
						<p class="text-xs font-medium text-muted-foreground">
							{t(locale, 'page.admin.addShiftLabel')}
						</p>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1">
								<Label for="ns-start-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.shiftLabelStart')}</Label
								>
								<Input
									id="ns-start-{user.id}"
									name="startAt"
									type="datetime-local"
									autocomplete="off"
									class="h-8 text-sm"
									required
								/>
							</div>
							<div class="space-y-1">
								<Label for="ns-end-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.shiftLabelEnd')}</Label
								>
								<Input
									id="ns-end-{user.id}"
									name="endAt"
									type="datetime-local"
									autocomplete="off"
									class="h-8 text-sm"
									required
								/>
							</div>
						</div>
						<div class="space-y-1">
							<Label for="ns-notes-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.shiftLabelLabel')}
								<span class="font-normal text-muted-foreground"
									>{t(locale, 'page.admin.labelOptional')}</span
								></Label
							>
							<Input
								id="ns-notes-{user.id}"
								name="notes"
								type="text"
								autocomplete="off"
								class="h-8 text-sm"
								placeholder={t(locale, 'page.admin.shiftPlaceholder')}
							/>
						</div>
						<Button type="submit" size="sm">{t(locale, 'page.admin.addShiftSubmit')}</Button>
					</form>
				</section>
			{/if}

			<!-- Password -->
			<section>
				<h2 class={sectionLabel}>{t(locale, 'page.admin.labelPassword')}</h2>
				<form
					method="POST"
					action="?/resetPassword"
					use:enhance={() =>
						({ update }) =>
							update()}
					class="flex gap-2"
				>
					<Input
						id="np-{user.id}"
						name="newPassword"
						type="password"
						autocomplete="new-password"
						class="max-w-[200px] h-9 text-sm"
						placeholder={t(locale, 'page.admin.newPasswordPlaceholder')}
						minlength={8}
						required
					/>
					<Button type="submit" size="sm">{t(locale, 'page.admin.setPassword')}</Button>
				</form>
			</section>

			<!-- Deactivate / Activate -->
			{#if user.id !== currentUserId}
				<section class="border-t border-border pt-5">
					<form
						method="POST"
						action="?/toggleActive"
						use:enhance={() =>
							({ update }) =>
								update()}
					>
						<input type="hidden" name="userId" value={user.id} />
						<Button type="submit" variant="softDestructive" size="sm">
							{user.isActive
								? t(locale, 'page.admin.menuDeactivate')
								: t(locale, 'page.admin.menuActivate')}
						</Button>
					</form>
				</section>
			{/if}
		</div>
	</div>
</div>

<form bind:this={deleteShiftForm} method="POST" action="?/deleteShift" use:enhance class="hidden">
	<input type="hidden" name="shiftId" value={deleteShiftId} />
</form>

<ConfirmDialog
	open={confirmOpen}
	message={t(locale, 'component.confirmDialog.cantBeUndone')}
	onconfirm={() => {
		confirmOpen = false;
		deleteShiftForm?.requestSubmit();
	}}
	oncancel={() => (confirmOpen = false)}
/>
