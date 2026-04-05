<script lang="ts">
	import type { ActionData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent
	} from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from '$lib/i18n';
	import { Select } from '$lib/components/ui/select/index.js';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
	const locale = getLocale();

	function changeLocale(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		document.cookie = `einvault_locale=${value};path=/;max-age=31536000;SameSite=Lax`;
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.setup.title')} | EinVault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-background">
	<div class="w-full max-w-md">
		<div class="text-center mb-8">
			<h1 class="font-display text-4xl font-bold tracking-tight text-foreground">EinVault</h1>
			<p class="mt-2 text-sm text-muted-foreground">{t(locale, 'page.setup.tagline')}</p>
		</div>

		<Card class="animate-slide-up">
			<CardHeader>
				<CardTitle>{t(locale, 'page.setup.cardTitle')}</CardTitle>
				<CardDescription>
					{t(locale, 'page.setup.cardDescription')}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
					{#if form?.error}
						<Alert variant="destructive">
							<AlertDescription>{form.error}</AlertDescription>
						</Alert>
					{/if}

					<div class="space-y-1.5">
						<Label for="displayName">{t(locale, 'page.setup.displayNameLabel')}</Label>
						<Input
							id="displayName"
							name="displayName"
							type="text"
							placeholder={t(locale, 'page.setup.displayNamePlaceholder')}
							required
							autocomplete="name"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="username">{t(locale, 'page.login.usernameLabel')}</Label>
						<Input
							id="username"
							name="username"
							type="text"
							placeholder={t(locale, 'page.setup.usernamePlaceholder')}
							required
							autocomplete="username"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="password">{t(locale, 'page.login.passwordLabel')}</Label>
						<Input
							id="password"
							name="password"
							type="password"
							placeholder="••••••••"
							required
							minlength={8}
							autocomplete="new-password"
						/>
					</div>

					<div class="space-y-1.5">
						<Label for="confirmPassword">{t(locale, 'page.setup.confirmPasswordLabel')}</Label>
						<Input
							id="confirmPassword"
							name="confirmPassword"
							type="password"
							placeholder="••••••••"
							required
							minlength={8}
							autocomplete="new-password"
						/>
					</div>

					<Button type="submit" class="w-full mt-2" disabled={loading}>
						{loading
							? t(locale, 'page.setup.creatingAccount')
							: t(locale, 'page.setup.createAccount')}
					</Button>
				</form>
			</CardContent>
		</Card>

		<p class="text-center text-xs mt-6 text-muted-foreground">
			{t(locale, 'page.setup.firstRunNote')}
		</p>

		<div class="flex justify-center mt-4">
			<div class="max-w-[200px]">
				<Select value={locale} onchange={changeLocale}>
					{#each SUPPORTED_LOCALES as loc (loc)}
						<option value={loc}>{LOCALE_LABELS[loc]}</option>
					{/each}
				</Select>
			</div>
		</div>
	</div>
</div>
