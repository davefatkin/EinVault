<script lang="ts">
	import type { ActionData } from './$types';
	import AuthBrandPanel from '$lib/components/auth/AuthBrandPanel.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
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

<div class="min-h-screen flex items-center justify-center bg-background p-4 md:p-0">
	<div
		class="w-full max-w-sm md:max-w-none md:w-[860px] rounded-2xl overflow-hidden shadow-2xl md:grid md:grid-cols-[1.05fr_0.95fr]"
	>
		<AuthBrandPanel
			tagline={t(locale, 'page.login.tagline')}
			subtext={t(locale, 'page.setup.brandSubtext')}
			footer={t(locale, 'page.login.brandFooter')}
		/>

		<div class="flex flex-col justify-center bg-card px-8 py-8 md:px-11 md:py-12">
			<!-- Mobile-only subtext (the brand panel's copy is hidden on mobile) -->
			<div class="mb-6 md:hidden text-center" aria-hidden="true">
				<p class="text-sm text-muted-foreground">{t(locale, 'page.setup.brandSubtext')}</p>
			</div>

			<h2 class="font-display font-bold text-2xl text-foreground mb-1">
				{t(locale, 'page.setup.cardTitle')}
			</h2>
			<p class="text-sm text-muted-foreground mb-7">{t(locale, 'page.setup.cardDescription')}</p>

			<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
				{#if form?.error}
					<Alert variant="coral">
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
</div>
