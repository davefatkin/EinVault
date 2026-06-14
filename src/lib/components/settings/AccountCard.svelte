<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import AccountAvatar from '$lib/components/AccountAvatar.svelte';
	import { t, getLocale } from '$lib/i18n';

	let {
		user,
		immichEnabled,
		successMessage,
		errorMessage
	}: {
		user: {
			id: string;
			displayName: string | null;
			username: string;
			email: string | null;
			phone: string | null;
			avatarPath: string | null | undefined;
			role: 'admin' | 'member' | 'caretaker';
		};
		immichEnabled: boolean;
		successMessage?: string;
		errorMessage?: string;
	} = $props();

	const locale = getLocale();
	let showPasswordFields = $state(false);
	let savedAlertEl = $state<HTMLElement | null>(null);

	$effect(() => {
		if (successMessage && savedAlertEl) {
			savedAlertEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	});
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.accountCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		{#if successMessage}
			<div bind:this={savedAlertEl}>
				<Alert variant="success" class="mb-4">
					<AlertDescription>{successMessage}</AlertDescription>
				</Alert>
			</div>
		{/if}
		{#if errorMessage}
			<Alert variant="coral" class="mb-4">
				<AlertDescription>{errorMessage}</AlertDescription>
			</Alert>
		{/if}

		<AccountAvatar
			userId={user.id}
			displayName={user.displayName ?? ''}
			avatarPath={user.avatarPath}
			{immichEnabled}
		/>

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
					value={user.displayName ?? ''}
					required
				/>
			</div>

			<div class="space-y-1.5">
				<Label for="username">{t(locale, 'page.settings.labelUsername')}</Label>
				<Input
					id="username"
					name="username"
					type="text"
					value={user.username}
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
					value={user.email ?? ''}
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
					value={user.phone ?? ''}
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
					value={user.username}
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

		<div class="flex items-center justify-between text-sm mt-6 pt-4 border-t border-border">
			<span class="text-muted-foreground">{t(locale, 'page.settings.roleLabel')}</span>
			{#if user.role === 'admin'}
				<Badge variant="primary">{t(locale, 'enum.role.admin')}</Badge>
			{:else if user.role === 'caretaker'}
				<Badge variant="teal">{t(locale, 'enum.role.caretaker')}</Badge>
			{:else}
				<Badge variant="secondary">{t(locale, 'enum.role.member')}</Badge>
			{/if}
		</div>
	</CardContent>
</Card>
