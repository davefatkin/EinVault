<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import {
		Plus,
		Trash2,
		Pencil,
		Users,
		CalendarClock,
		UserX,
		UserCheck,
		KeyRound,
		EllipsisVertical
	} from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { localDatetimes } from '$lib/actions/localDatetimes';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let editingUserId = $state<string | null>(null);
	let resetingUserId = $state<string | null>(null);
	let assigningUserId = $state<string | null>(null);
	let managingShiftsUserId = $state<string | null>(null);
	let editingShiftId = $state<string | null>(null);
	let openMenuUserId = $state<string | null>(null);

	let confirmOpen = $state(false);
	let deleteShiftId = $state('');
	let deleteShiftForm = $state<HTMLFormElement | null>(null);

	let toggleActiveUserId = $state('');
	let toggleActiveFormEl = $state<HTMLFormElement | null>(null);
	function toggleActiveForm(userId: string) {
		toggleActiveUserId = userId;
		tick().then(() => toggleActiveFormEl?.requestSubmit());
	}

	function assignedCompanionIds(userId: string): string[] {
		return data.assignments.filter((a) => a.userId === userId).map((a) => a.companionId);
	}

	function userShifts(userId: string) {
		return data.shifts.filter((s) => s.userId === userId);
	}

	function localDatetimeISO(d: Date | string) {
		const dt = new Date(d);
		const p = (n: number) => String(n).padStart(2, '0');
		return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
	}

	function handleWindowClick(e: MouseEvent) {
		if (openMenuUserId === null) return;
		const target = e.target as Element;
		if (!target.closest('[data-user-menu]')) {
			openMenuUserId = null;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<svelte:head>
	<title>{t(locale, 'page.admin.pageTitle')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="font-display text-2xl font-bold text-foreground">
				{t(locale, 'page.admin.usersTitle')}
			</h1>
			<p class="text-sm mt-1 text-muted-foreground">
				{data.users.length !== 1
					? t(locale, 'page.admin.accountCountPlural', { count: data.users.length })
					: t(locale, 'page.admin.accountCount', { count: data.users.length })}
			</p>
		</div>
		<Button
			onclick={() => (showCreateForm = !showCreateForm)}
			variant={showCreateForm ? 'secondary' : 'default'}
			size="sm"
		>
			{#if !showCreateForm}<Plus class="h-4 w-4 mr-1.5" />{/if}
			{showCreateForm ? t(locale, 'common.cancel') : t(locale, 'page.admin.newUser')}
		</Button>
	</div>

	{#if form?.createError || form?.toggleError || form?.resetError || form?.assignError || form?.shiftError || form?.editError}
		<Alert variant="destructive">
			<AlertDescription>
				{form.createError ??
					form.toggleError ??
					form.resetError ??
					form.assignError ??
					form.shiftError ??
					form.editError}
			</AlertDescription>
		</Alert>
	{/if}

	{#if form?.createSuccess || form?.editSuccess}
		<Alert variant="success">
			<AlertDescription>
				{form.createSuccess
					? t(locale, 'page.admin.userCreated')
					: t(locale, 'page.admin.userUpdated')}
			</AlertDescription>
		</Alert>
	{/if}

	{#if form?.assignSuccess}
		<Alert variant="success">
			<AlertDescription>{t(locale, 'page.admin.assignmentsUpdated')}</AlertDescription>
		</Alert>
	{/if}

	<!-- Create user form -->
	{#if showCreateForm}
		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.admin.createUserTitle')}</CardTitle>
			</CardHeader>
			<CardContent>
				<form
					method="POST"
					action="?/create"
					use:enhance={() => {
						return ({ result, update }) => {
							update();
							if (result.type === 'success') showCreateForm = false;
						};
					}}
					class="space-y-4"
				>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="displayName">{t(locale, 'page.admin.labelDisplayName')}</Label>
							<Input id="displayName" name="displayName" type="text" autocomplete="name" required />
						</div>
						<div class="space-y-1.5">
							<Label for="username">{t(locale, 'page.admin.labelUsername')}</Label>
							<Input id="username" name="username" type="text" autocomplete="username" required />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div class="space-y-1.5">
							<Label for="password">{t(locale, 'page.admin.labelPassword')}</Label>
							<Input
								id="password"
								name="password"
								type="password"
								autocomplete="new-password"
								required
								minlength={8}
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="role">{t(locale, 'page.admin.labelRole')}</Label>
							<Select id="role" name="role">
								<option value="member">{t(locale, 'enum.role.member')}</option>
								<option value="admin">{t(locale, 'enum.role.admin')}</option>
								<option value="caretaker">{t(locale, 'enum.role.caretaker')}</option>
							</Select>
						</div>
					</div>
					<Button type="submit">{t(locale, 'page.admin.createUserSubmit')}</Button>
				</form>
			</CardContent>
		</Card>
	{/if}

	<!-- User list -->
	<Card class="divide-y divide-border">
		{#each data.users as user (user.id)}
			<div class="px-6 py-4 space-y-3">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
							<span class="font-medium text-foreground">{user.displayName}</span>
							<Badge variant="secondary" class="font-mono">{user.username}</Badge>
							{#if user.role === 'admin'}
								<Badge variant="bark">{t(locale, 'enum.role.admin')}</Badge>
							{:else if user.role === 'caretaker'}
								<Badge variant="moss">{t(locale, 'enum.role.caretaker')}</Badge>
							{:else}
								<Badge variant="sky">{t(locale, 'enum.role.member')}</Badge>
							{/if}
							{#if !user.isActive}
								<Badge variant="destructive">{t(locale, 'page.admin.inactiveBadge')}</Badge>
							{/if}
						</div>
						{#if user.email || user.phone}
							<p class="text-xs mt-0.5 text-muted-foreground">
								{#if user.email}<a href="mailto:{user.email}" class="hover:underline"
										>{user.email}</a
									>{/if}
								{#if user.email && user.phone}&ensp;·&ensp;{/if}
								{#if user.phone}<a href="tel:{user.phone}" class="hover:underline">{user.phone}</a
									>{/if}
							</p>
						{/if}
						<p class="text-xs mt-0.5 text-muted-foreground">
							{t(locale, 'page.admin.joined')}
							<LocalTime date={user.createdAt} />
							{#if user.lastLoginAt}&nbsp;· {t(locale, 'page.admin.lastLogin')}
								<LocalTime date={user.lastLoginAt} />{/if}
						</p>
					</div>

					<!-- Actions: Edit (primary) + overflow menu -->
					<div class="flex items-center gap-0.5 shrink-0">
						<Button
							variant="ghost"
							size="sm"
							class="h-8 w-8 p-0 md:w-auto md:px-2.5 md:gap-1.5 text-xs"
							onclick={() => (editingUserId = editingUserId === user.id ? null : user.id)}
						>
							<Pencil class="h-3.5 w-3.5 shrink-0" />
							<span class="hidden md:inline">Edit</span>
						</Button>

						<div class="relative" data-user-menu>
							<Button
								variant="ghost"
								size="sm"
								class="h-8 w-8 p-0"
								onclick={(e) => {
									e.stopPropagation();
									openMenuUserId = openMenuUserId === user.id ? null : user.id;
								}}
								aria-label={t(locale, 'aria.moreActions')}
								aria-expanded={openMenuUserId === user.id}
								aria-haspopup="true"
							>
								<EllipsisVertical class="h-4 w-4" />
							</Button>

							{#if openMenuUserId === user.id}
								<div
									class="absolute right-0 top-full z-50 mt-1 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px]"
									role="menu"
								>
									{#if user.role === 'caretaker'}
										<button
											type="button"
											role="menuitem"
											class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left"
											onclick={() => {
												assigningUserId = assigningUserId === user.id ? null : user.id;
												openMenuUserId = null;
											}}
										>
											<Users class="h-3.5 w-3.5 shrink-0" />
											{t(locale, 'page.admin.menuCompanions')}
										</button>
										<button
											type="button"
											role="menuitem"
											class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left"
											onclick={() => {
												managingShiftsUserId = managingShiftsUserId === user.id ? null : user.id;
												openMenuUserId = null;
											}}
										>
											<CalendarClock class="h-3.5 w-3.5 shrink-0" />
											{t(locale, 'page.admin.menuShifts')}
											{#if userShifts(user.id).length > 0}
												<Badge variant="secondary" class="ml-auto text-[10px] px-1.5 py-0">
													{userShifts(user.id).length}
												</Badge>
											{/if}
										</button>
									{/if}

									{#if user.id !== data.currentUserId}
										<button
											type="button"
											role="menuitem"
											class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left text-red-600 dark:text-red-400 hover:text-red-600"
											onclick={() => {
												openMenuUserId = null;
												toggleActiveForm(user.id);
											}}
										>
											{#if user.isActive}
												<UserX class="h-3.5 w-3.5 shrink-0" />
												{t(locale, 'page.admin.menuDeactivate')}
											{:else}
												<UserCheck class="h-3.5 w-3.5 shrink-0" />
												{t(locale, 'page.admin.menuActivate')}
											{/if}
										</button>
									{/if}

									<button
										type="button"
										role="menuitem"
										class="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent text-left"
										onclick={() => {
											resetingUserId = resetingUserId === user.id ? null : user.id;
											openMenuUserId = null;
										}}
									>
										<KeyRound class="h-3.5 w-3.5 shrink-0" />
										{t(locale, 'page.admin.menuResetPassword')}
									</button>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Edit user panel -->
				{#if editingUserId === user.id}
					<form
						method="POST"
						action="?/editUser"
						use:enhance={() =>
							({ result, update }) => {
								update();
								if (result.type === 'success') editingUserId = null;
							}}
						class="space-y-4 animate-slide-up rounded-lg border border-border bg-muted/30 p-4"
					>
						<input type="hidden" name="userId" value={user.id} />
						<p class="text-xs font-medium text-muted-foreground">
							{t(locale, 'page.admin.editUserLabel', { name: user.displayName })}
						</p>
						<div class="grid grid-cols-2 gap-3">
							<div class="space-y-1.5">
								<Label for="edit-displayName-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.labelDisplayName')}</Label
								>
								<Input
									id="edit-displayName-{user.id}"
									name="displayName"
									class="h-8 text-sm"
									autocomplete="name"
									value={user.displayName}
									required
								/>
							</div>
							<div class="space-y-1.5">
								<Label for="edit-username-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.labelUsername')}</Label
								>
								<Input
									id="edit-username-{user.id}"
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
								<Label for="edit-email-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.labelEmail')}
									<span class="font-normal text-muted-foreground"
										>{t(locale, 'page.admin.labelOptional')}</span
									></Label
								>
								<Input
									id="edit-email-{user.id}"
									name="email"
									type="email"
									class="h-8 text-sm"
									autocomplete="email"
									value={user.email ?? ''}
									placeholder="radical@edward.com"
								/>
							</div>
							<div class="space-y-1.5">
								<Label for="edit-phone-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.labelPhone')}
									<span class="font-normal text-muted-foreground"
										>{t(locale, 'page.admin.labelOptional')}</span
									></Label
								>
								<Input
									id="edit-phone-{user.id}"
									name="phone"
									type="tel"
									class="h-8 text-sm"
									autocomplete="tel"
									value={user.phone ?? ''}
									placeholder="(555) 000-0000"
								/>
							</div>
						</div>
						<div class="space-y-1.5">
							<Label for="edit-role-{user.id}" class="text-xs"
								>{t(locale, 'page.admin.labelRole')}</Label
							>
							<Select id="edit-role-{user.id}" name="role" class="h-8">
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
						<div class="flex gap-2">
							<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onclick={() => (editingUserId = null)}>{t(locale, 'common.cancel')}</Button
							>
						</div>
					</form>
				{/if}

				<!-- Companion assignment panel -->
				{#if assigningUserId === user.id}
					<form
						method="POST"
						action="?/assignCompanions"
						use:enhance={() =>
							({ update }) => {
								update();
								assigningUserId = null;
							}}
						class="space-y-3 animate-slide-up rounded-lg border border-border bg-muted/30 p-4"
					>
						<input type="hidden" name="userId" value={user.id} />
						<p class="text-xs font-medium text-muted-foreground">
							{t(locale, 'page.admin.assignCompanionsLabel', { name: user.displayName })}
						</p>
						{#if data.companions.length === 0}
							<p class="text-xs text-muted-foreground">
								{t(locale, 'page.admin.noActiveCompanions')}
							</p>
						{:else}
							<div class="space-y-2">
								{#each data.companions as companion (companion.id)}
									<label class="flex items-center gap-2 cursor-pointer">
										<input
											id="companionId-{companion.id}"
											type="checkbox"
											name="companionId"
											value={companion.id}
											checked={assignedCompanionIds(user.id).includes(companion.id)}
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
						<div class="flex gap-2">
							<Button type="submit" size="sm">{t(locale, 'common.save')}</Button>
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onclick={() => (assigningUserId = null)}>{t(locale, 'common.cancel')}</Button
							>
						</div>
					</form>
				{/if}

				<!-- Shifts management panel -->
				{#if managingShiftsUserId === user.id}
					<div class="space-y-4 animate-slide-up rounded-lg border border-border bg-muted/30 p-4">
						<p class="text-xs font-medium text-muted-foreground">
							{t(locale, 'page.admin.shiftsForUser', { name: user.displayName })}
						</p>

						{#if userShifts(user.id).length === 0}
							<p class="text-xs text-muted-foreground">
								{t(locale, 'page.admin.noShiftsScheduled')}
							</p>
						{:else}
							<div class="space-y-2">
								{#each userShifts(user.id) as shift (shift.id)}
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
											class="space-y-3 rounded-lg border border-border px-3 py-3 animate-slide-up bg-background"
										>
											<input type="hidden" name="shiftId" value={shift.id} />
											<div class="grid grid-cols-2 gap-3">
												<div class="space-y-1">
													<Label for="edit-start-{shift.id}" class="text-xs"
														>{t(locale, 'page.admin.shiftLabelStart')}</Label
													>
													<Input
														id="edit-start-{shift.id}"
														name="startAt"
														type="datetime-local"
														autocomplete="off"
														class="h-8 text-sm"
														value={localDatetimeISO(shift.startAt)}
														required
													/>
												</div>
												<div class="space-y-1">
													<Label for="edit-end-{shift.id}" class="text-xs"
														>{t(locale, 'page.admin.shiftLabelEnd')}</Label
													>
													<Input
														id="edit-end-{shift.id}"
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
												<Label for="edit-notes-{shift.id}" class="text-xs"
													>{t(locale, 'page.admin.shiftLabelLabel')}
													<span class="font-normal text-muted-foreground"
														>{t(locale, 'page.admin.labelOptional')}</span
													></Label
												>
												<Input
													id="edit-notes-{shift.id}"
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
													onclick={() => (editingShiftId = null)}
													>{t(locale, 'common.cancel')}</Button
												>
											</div>
										</form>
									{:else}
										<div
											class="flex items-center justify-between gap-3 text-sm rounded-lg border border-border px-3 py-2 bg-background"
										>
											<div class="min-w-0 text-sm text-foreground">
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
													variant="ghost"
													size="sm"
													class="h-7 text-xs"
													onclick={() => (editingShiftId = shift.id)}
													>{t(locale, 'common.edit')}</Button
												>
												<Button
													type="button"
													variant="ghost"
													size="sm"
													class="h-7 gap-1.5 px-2 text-xs hover:text-red-500 dark:hover:text-red-400"
													onclick={() => {
														deleteShiftId = shift.id;
														confirmOpen = true;
													}}
												>
													<Trash2 class="h-3.5 w-3.5" />
													<span class="hidden sm:inline">{t(locale, 'common.delete')}</span>
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
							use:enhance
							class="space-y-3 pt-3 border-t border-border"
						>
							<input type="hidden" name="userId" value={user.id} />
							<p class="text-xs font-medium text-muted-foreground">
								{t(locale, 'page.admin.addShiftLabel')}
							</p>
							<div class="grid grid-cols-2 gap-3">
								<div class="space-y-1">
									<Label for="shift-start-{user.id}" class="text-xs"
										>{t(locale, 'page.admin.shiftLabelStart')}</Label
									>
									<Input
										id="shift-start-{user.id}"
										name="startAt"
										type="datetime-local"
										autocomplete="off"
										class="h-8 text-sm"
										required
									/>
								</div>
								<div class="space-y-1">
									<Label for="shift-end-{user.id}" class="text-xs"
										>{t(locale, 'page.admin.shiftLabelEnd')}</Label
									>
									<Input
										id="shift-end-{user.id}"
										name="endAt"
										type="datetime-local"
										autocomplete="off"
										class="h-8 text-sm"
										required
									/>
								</div>
							</div>
							<div class="space-y-1">
								<Label for="shift-notes-{user.id}" class="text-xs"
									>{t(locale, 'page.admin.shiftLabelLabel')}
									<span class="font-normal text-muted-foreground"
										>{t(locale, 'page.admin.labelOptional')}</span
									></Label
								>
								<Input
									id="shift-notes-{user.id}"
									name="notes"
									type="text"
									autocomplete="off"
									class="h-8 text-sm"
									placeholder={t(locale, 'page.admin.shiftPlaceholder')}
								/>
							</div>
							<div class="flex gap-2">
								<Button type="submit" size="sm">{t(locale, 'page.admin.addShiftSubmit')}</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onclick={() => (managingShiftsUserId = null)}>{t(locale, 'common.close')}</Button
								>
							</div>
						</form>
					</div>
				{/if}

				<!-- Reset password panel -->
				{#if resetingUserId === user.id}
					<form
						method="POST"
						action="?/resetPassword"
						use:enhance={() =>
							({ update }) => {
								update();
								resetingUserId = null;
							}}
						class="flex gap-2 animate-slide-up"
					>
						<input type="hidden" name="userId" value={user.id} />
						<Input
							id="newPassword"
							name="newPassword"
							type="password"
							autocomplete="new-password"
							class="max-w-[200px] h-9 text-sm"
							placeholder={t(locale, 'page.admin.newPasswordPlaceholder')}
							minlength={8}
							required
						/>
						<Button type="submit" size="sm">{t(locale, 'page.admin.setPassword')}</Button>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							onclick={() => (resetingUserId = null)}>{t(locale, 'common.cancel')}</Button
						>
					</form>
				{/if}
			</div>
		{/each}
	</Card>
</div>

<form bind:this={deleteShiftForm} method="POST" action="?/deleteShift" use:enhance class="hidden">
	<input type="hidden" name="shiftId" value={deleteShiftId} />
</form>

<form
	bind:this={toggleActiveFormEl}
	method="POST"
	action="?/toggleActive"
	use:enhance
	class="hidden"
>
	<input type="hidden" name="userId" value={toggleActiveUserId} />
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
