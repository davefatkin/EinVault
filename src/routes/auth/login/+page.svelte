<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import AuthBrandPanel from '$lib/components/auth/AuthBrandPanel.svelte';
	import { t, getLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from '$lib/i18n';

	let { form, data }: { form: ActionData; data: PageData } = $props();
	let loading = $state(false);
	const locale = getLocale();

	function changeLocale(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		document.cookie = `einvault_locale=${value};path=/;max-age=31536000;SameSite=Lax`;
		window.location.reload();
	}
</script>

<svelte:head>
	<title>{t(locale, 'page.login.title')} | EinVault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-background p-4 md:p-0">
	<!-- Two-column card at md+, single column on mobile -->
	<div
		class="w-full max-w-sm md:max-w-none md:w-[860px] rounded-2xl overflow-hidden shadow-2xl md:grid md:grid-cols-[1.05fr_0.95fr]"
	>
		<!-- Brand panel — full column at md+, compact header strip on mobile -->
		<AuthBrandPanel
			tagline={t(locale, 'page.login.tagline')}
			subtext={t(locale, 'page.login.taglineSubtext')}
			footer={t(locale, 'page.login.brandFooter')}
		/>

		<!-- Form panel -->
		<div class="flex flex-col justify-center px-8 py-8 md:px-11 md:py-12 bg-card">
			<!-- Mobile-only tagline (replaces the hidden brand panel text) -->
			<div class="mb-6 md:hidden text-center">
				<p class="text-sm text-muted-foreground">{t(locale, 'page.login.tagline')}</p>
			</div>

			<h2 class="font-display font-bold text-2xl text-foreground mb-1">
				{t(locale, 'page.login.welcomeHeading')}
			</h2>
			<p class="text-sm text-muted-foreground mb-7">{t(locale, 'page.login.welcomeSubtext')}</p>

			{#if data.oidcError}
				<Alert variant="destructive" class="mb-5 animate-slide-up">
					<AlertDescription>{data.oidcError}</AlertDescription>
				</Alert>
			{/if}

			{#if data.oidcEnabled}
				<a href="/auth/oidc/login" class="w-full mb-4 block">
					<Button variant="outline" class="w-full" type="button">
						{t(locale, 'page.login.signInWith', { provider: data.oidcProviderName })}
					</Button>
				</a>

				<div class="relative flex items-center gap-3 mb-5">
					<div class="flex-1 border-t border-border"></div>
					<span class="text-xs text-muted-foreground">{t(locale, 'common.or')}</span>
					<div class="flex-1 border-t border-border"></div>
				</div>
			{/if}

			<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
				{#if form?.error}
					<Alert variant="destructive" class="animate-slide-up">
						<AlertDescription>{form.error}</AlertDescription>
					</Alert>
				{/if}

				<div class="space-y-1.5">
					<Label for="username">{t(locale, 'page.login.usernameLabel')}</Label>
					<Input
						id="username"
						name="username"
						type="text"
						placeholder={t(locale, 'page.login.usernamePlaceholder')}
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
						autocomplete="current-password"
					/>
					{#if data.mailEnabled}
						<div class="text-right">
							<a
								href="/auth/forgot"
								class="text-xs text-primary hover:underline underline-offset-4"
							>
								{t(locale, 'page.login.forgotPassword')}
							</a>
						</div>
					{/if}
				</div>

				<Button type="submit" class="w-full" size="lg" disabled={loading}>
					{loading ? t(locale, 'page.login.signingIn') : t(locale, 'page.login.signIn')}
				</Button>
			</form>

			<div class="flex justify-center mt-6">
				<div class="w-44">
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
