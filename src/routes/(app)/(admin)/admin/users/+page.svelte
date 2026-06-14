<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Plus, Users, ShieldCheck } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import UserManageDrawer from '$lib/components/admin/UserManageDrawer.svelte';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showCreateForm = $state(false);
	let manageUserId = $state<string | null>(null);

	let manageUser = $derived(data.users.find((u) => u.id === manageUserId) ?? null);

	const roleBadge = { admin: 'primary', caretaker: 'teal', member: 'gold' } as const;
</script>

<svelte:head>
	<title>{t(locale, 'page.admin.pageTitle')} | EinVault</title>
</svelte:head>

<div class="max-w-3xl mx-auto space-y-6">
	<PageHeader title={t(locale, 'page.admin.usersTitle')} tint="primary">
		{#snippet icon()}<Users class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			<Button
				onclick={() => (showCreateForm = !showCreateForm)}
				variant={showCreateForm ? 'secondary' : 'default'}
				size="sm"
			>
				{#if !showCreateForm}<Plus class="h-4 w-4 mr-1.5" />{/if}
				{showCreateForm ? t(locale, 'common.cancel') : t(locale, 'page.admin.newUser')}
			</Button>
		{/snippet}
	</PageHeader>
	<p class="text-sm text-muted-foreground -mt-2">
		{data.users.length !== 1
			? t(locale, 'page.admin.accountCountPlural', { count: data.users.length })
			: t(locale, 'page.admin.accountCount', { count: data.users.length })}
	</p>

	{#if form?.createError}
		<Alert variant="coral">
			<AlertDescription>{form.createError}</AlertDescription>
		</Alert>
	{/if}

	{#if form?.createSuccess}
		<Alert variant="success">
			<AlertDescription>{t(locale, 'page.admin.userCreated')}</AlertDescription>
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

	<!-- Security section -->
	<PageHeader title={t(locale, 'page.admin.securitySection')} tint="primary">
		{#snippet icon()}<ShieldCheck class="h-5 w-5" />{/snippet}
	</PageHeader>

	{#if form?.require2faSuccess}
		<Alert variant="success" class="-mt-2">
			<AlertDescription>{t(locale, 'common.saved')}</AlertDescription>
		</Alert>
	{/if}

	<Card>
		<CardContent class="pt-5">
			<form method="POST" action="?/setRequire2fa" use:enhance class="space-y-3">
				<div class="space-y-1.5">
					<Label for="require2fa">{t(locale, 'page.admin.require2faLabel')}</Label>
					<Select
						id="require2fa"
						name="value"
						disabled={!data.twoFactorAvailable}
						onchange={(e) => (e.currentTarget as HTMLSelectElement).form?.requestSubmit()}
					>
						<option value="off" selected={data.require2fa === 'off'}
							>{t(locale, 'page.admin.require2faOff')}</option
						>
						<option value="admins" selected={data.require2fa === 'admins'}
							>{t(locale, 'page.admin.require2faAdmins')}</option
						>
						<option value="everyone" selected={data.require2fa === 'everyone'}
							>{t(locale, 'page.admin.require2faEveryone')}</option
						>
					</Select>
					<p class="text-xs text-muted-foreground">
						{#if !data.twoFactorAvailable}
							Set <code class="font-mono">TWOFA_ENC_KEY</code> to enable two-factor enforcement.
						{:else}
							{t(locale, 'page.admin.require2faHelp')}
						{/if}
					</p>
				</div>
			</form>
		</CardContent>
	</Card>

	<!-- User list -->
	<Card class="divide-y divide-border">
		{#each data.users as user (user.id)}
			<div class="px-6 py-4 flex items-start justify-between gap-3">
				<div class="min-w-0">
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
						<span class="font-medium text-foreground">{user.displayName}</span>
						<Badge variant="secondary" class="font-mono">{user.username}</Badge>
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
						{#if !user.isActive}
							<Badge variant="coral">{t(locale, 'page.admin.inactiveBadge')}</Badge>
						{/if}
					</div>
					{#if user.email || user.phone}
						<p class="text-xs mt-0.5 text-muted-foreground">
							{#if user.email}<a href="mailto:{user.email}" class="hover:underline">{user.email}</a
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
				<Button variant="soft" size="sm" class="shrink-0" onclick={() => (manageUserId = user.id)}>
					{t(locale, 'page.admin.manage')}
				</Button>
			</div>
		{/each}
	</Card>
</div>

{#if manageUser}
	<UserManageDrawer
		user={manageUser}
		companions={data.companions}
		assignments={data.assignments}
		shifts={data.shifts}
		currentUserId={data.currentUserId}
		onclose={() => (manageUserId = null)}
	/>
{/if}
