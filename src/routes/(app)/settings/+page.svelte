<script lang="ts">
	import type { PageData, ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';

	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import { Pencil, Plus, RotateCcw } from '@lucide/svelte';
	import { getContext } from 'svelte';
	import { t, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from '$lib/i18n';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const locale = getLocale();
	const serverTimezone = getContext<string | undefined>('serverTimezone');

	let showPasswordFields = $state(false);
	let localeForm: HTMLFormElement;

	function formatArchivedDate(d: Date | null | undefined): string {
		if (!d) return '';
		return new Date(d).toLocaleDateString(undefined, {
			month: 'long',
			day: 'numeric',
			year: 'numeric',
			...(serverTimezone ? { timeZone: serverTimezone } : {})
		});
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.settings.title')} | EinVault</title>
</svelte:head>

<div class="max-w-lg mx-auto space-y-6">
	<div>
		<h1 class="font-display text-2xl font-bold text-foreground">
			{t(locale, 'page.settings.title')}
		</h1>
		<p class="text-sm mt-1 text-muted-foreground">{t(locale, 'page.settings.subtitle')}</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.settings.accountCard')}</CardTitle>
		</CardHeader>
		<CardContent>
			{#if form?.accountSuccess}
				<Alert variant="success" class="mb-4">
					<AlertDescription>{t(locale, 'page.settings.accountUpdated')}</AlertDescription>
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
					<Label for="displayName">{t(locale, 'page.settings.labelDisplayName')}</Label>
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
					<Label for="username">{t(locale, 'page.settings.labelUsername')}</Label>
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
						{t(locale, 'page.settings.labelEmail')}
						<span class="text-muted-foreground font-normal"
							>{t(locale, 'page.settings.optional')}</span
						>
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
						{t(locale, 'page.settings.labelPhone')}
						<span class="text-muted-foreground font-normal"
							>{t(locale, 'page.settings.optional')}</span
						>
					</Label>
					<Input
						id="phone"
						name="phone"
						type="tel"
						value={data.user?.phone ?? ''}
						autocomplete="tel"
						placeholder={t(locale, 'common.placeholderPhone')}
					/>
				</div>

				<div>
					<button
						type="button"
						onclick={() => (showPasswordFields = !showPasswordFields)}
						class="text-sm text-primary hover:underline"
					>
						{showPasswordFields
							? t(locale, 'page.settings.cancelPasswordChange')
							: t(locale, 'page.settings.changePassword')}
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
							<Label for="currentPassword">{t(locale, 'page.settings.labelCurrentPassword')}</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								placeholder="••••••••"
								autocomplete="current-password"
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="newPassword">{t(locale, 'page.settings.labelNewPassword')}</Label>
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
							<Label for="confirmPassword">{t(locale, 'page.settings.labelConfirmPassword')}</Label>
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

				<Button type="submit">{t(locale, 'page.settings.saveChanges')}</Button>
			</form>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle>{t(locale, 'page.settings.languageCard')}</CardTitle>
		</CardHeader>
		<CardContent>
			<p class="text-sm text-muted-foreground mb-3">
				{t(locale, 'page.settings.languageDescription')}
			</p>
			<form
				method="POST"
				action="?/locale"
				bind:this={localeForm}
				use:enhance={() => {
					return async () => {
						window.location.reload();
					};
				}}
			>
				<div class="max-w-[200px]">
					<Select
						name="locale"
						value={data.user?.locale ?? 'en'}
						onchange={() => localeForm.requestSubmit()}
					>
						{#each SUPPORTED_LOCALES as loc (loc)}
							<option value={loc}>{LOCALE_LABELS[loc]}</option>
						{/each}
					</Select>
				</div>
			</form>
		</CardContent>
	</Card>

	{#if data.companions.length > 0 || data.user?.role !== 'caretaker'}
		<Card>
			<CardHeader>
				<div class="flex items-center justify-between">
					<CardTitle>{t(locale, 'page.settings.companionsCard')}</CardTitle>
					<Button href="/companions/new" size="sm" variant="outline" class="gap-1.5">
						<Plus class="h-4 w-4" /><span>{t(locale, 'page.settings.addCompanion')}</span>
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{#if data.companions.length === 0}
					<p class="text-sm text-muted-foreground">{t(locale, 'page.settings.noCompanions')}</p>
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
									<Pencil class="h-3.5 w-3.5" /><span class="hidden sm:inline"
										>{t(locale, 'common.edit')}</span
									>
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
				<CardTitle>{t(locale, 'page.settings.pastCompanionsCard')}</CardTitle>
			</CardHeader>
			<CardContent>
				{#if form?.restoreSuccess}
					<Alert variant="success" class="mb-4">
						<AlertDescription>{t(locale, 'page.settings.companionRestored')}</AlertDescription>
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
											{t(locale, 'page.settings.archivedOn')}
											{formatArchivedDate(companion.archivedAt)}
										</span>
									{/if}
									{#if companion.archiveNote}
										<p class="text-xs text-muted-foreground">{companion.archiveNote}</p>
									{/if}
								</div>
							</div>
							<div class="flex items-center gap-1 shrink-0">
								<Button href="/{companion.id}" variant="ghost" size="sm"
									>{t(locale, 'page.settings.viewCompanion')}</Button
								>
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
										<span class="hidden sm:inline"
											>{t(locale, 'page.settings.restoreCompanion')}</span
										>
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
				<span class="text-muted-foreground">{t(locale, 'page.settings.roleLabel')}</span>
				{#if data.user?.role === 'admin'}
					<Badge variant="bark">{t(locale, 'enum.role.admin')}</Badge>
				{:else if data.user?.role === 'caretaker'}
					<Badge variant="moss">{t(locale, 'enum.role.caretaker')}</Badge>
				{:else}
					<Badge variant="sky">{t(locale, 'enum.role.member')}</Badge>
				{/if}
			</div>
		</CardContent>
	</Card>
</div>
