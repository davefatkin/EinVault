<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import { Pencil, Plus, RotateCcw } from '@lucide/svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showPasswordFields = $state(false);

	function formatArchivedDate(d: Date | null | undefined): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		});
	}
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
						placeholder="spike@spiegel.com"
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

	{#if data.companions.length > 0 || data.user?.role !== 'caretaker'}
		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>Companions</CardTitle>
					<Button href="/companions/new" size="sm" variant="outline" class="gap-1.5">
						<Plus class="h-4 w-4" /><span>Add Companion</span>
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{#if data.companions.length === 0}
					<p class="text-sm text-muted-foreground">No companions yet.</p>
				{:else}
					<ul class="space-y-2">
						{#each data.companions as companion (companion.id)}
							<li class="flex items-center justify-between gap-3">
								<div class="flex items-center gap-2.5 min-w-0">
									<CompanionAvatar
										companionId={companion.id}
										avatarPath={companion.avatarPath}
										name={companion.name}
										size="sm"
									/>
									<span class="text-sm font-medium truncate text-foreground">{companion.name}</span>
								</div>
								<Button
									href="/companions/{companion.id}/edit"
									variant="ghost"
									size="sm"
									class="gap-1.5 shrink-0"
								>
									<Pencil class="h-3.5 w-3.5" /><span class="hidden sm:inline">Edit</span>
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</CardContent>
		</Card>
	{/if}

	{#if data.archivedCompanions && data.archivedCompanions.length > 0}
		<Card>
			<CardHeader>
				<CardTitle>Past Companions</CardTitle>
			</CardHeader>
			<CardContent>
				{#if form?.restoreSuccess}
					<Alert variant="success" class="mb-4">
						<AlertDescription>Companion restored successfully.</AlertDescription>
					</Alert>
				{/if}
				<ul class="space-y-3">
					{#each data.archivedCompanions as companion (companion.id)}
						<li class="flex items-center justify-between gap-3">
							<div class="flex items-center gap-2.5 min-w-0">
								<CompanionAvatar
									companionId={companion.id}
									avatarPath={companion.avatarPath}
									name={companion.name}
									size="sm"
									archived={true}
								/>
								<div class="min-w-0">
									<span class="text-sm italic text-muted-foreground truncate block"
										>{companion.name}</span
									>
									{#if companion.archivedAt}
										<span class="text-xs text-muted-foreground">
											Archived {formatArchivedDate(companion.archivedAt)}
										</span>
									{/if}
									{#if companion.archiveNote}
										<p class="text-xs text-muted-foreground">{companion.archiveNote}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<Button href="/{companion.id}" variant="ghost" size="sm">View</Button>
								<form
									method="POST"
									action="?/restore"
									use:enhance={() =>
										async ({ update }) => {
											await update({ reset: false });
										}}
								>
									<input type="hidden" name="companionId" value={companion.id} />
									<Button type="submit" variant="ghost" size="sm" class="gap-1.5">
										<RotateCcw class="h-3.5 w-3.5" />
										<span class="hidden sm:inline">Restore</span>
									</Button>
								</form>
							</div>
						</li>
					{/each}
				</ul>
			</CardContent>
		</Card>
	{/if}

	<Card>
		<CardContent class="pt-4">
			<div class="flex items-center justify-between text-sm">
				<span class="text-muted-foreground">Role</span>
				{#if data.user?.role === 'admin'}
					<Badge variant="bark">Admin</Badge>
				{:else if data.user?.role === 'caretaker'}
					<Badge variant="moss">Caretaker</Badge>
				{:else}
					<Badge variant="sky">Member</Badge>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
