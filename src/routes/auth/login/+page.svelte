<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import PawLogo from '$lib/components/PawLogo.svelte';
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
		<div
			class="relative flex flex-col justify-between px-8 py-7 md:px-11 md:py-12 text-white overflow-hidden"
			style="background: radial-gradient(130% 130% at 0% 0%, hsl(252 100% 65% / 0.55), transparent 55%), radial-gradient(130% 130% at 100% 100%, hsl(13 100% 67% / 0.5), transparent 55%), hsl(237 28% 11%);"
		>
			<!-- Radial accent blobs -->
			<div
				class="pointer-events-none absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-20"
				style="background: radial-gradient(circle, hsl(252 100% 65%), transparent 70%);"
				aria-hidden="true"
			></div>
			<div
				class="pointer-events-none absolute -bottom-16 -right-16 w-56 h-56 rounded-full opacity-15"
				style="background: radial-gradient(circle, hsl(13 100% 67%), transparent 70%);"
				aria-hidden="true"
			></div>

			<!-- Logo row -->
			<a href="/" class="relative flex items-center gap-2.5 self-start z-10">
				<div
					class="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center bg-brand-gradient shadow-lg"
					aria-hidden="true"
				>
					<PawLogo class="w-5 h-5 text-white" />
				</div>
				<span class="font-display font-extrabold text-xl tracking-tight text-white">EinVault</span>
			</a>

			<!-- Tagline block — hidden on mobile (too cramped in strip mode) -->
			<div class="relative z-10 hidden md:block">
				<p class="font-display font-extrabold text-4xl leading-[1.03] tracking-tight">
					{t(locale, 'page.login.tagline')}
				</p>
				<p class="mt-3 text-[15px] text-white/80 max-w-[30ch]">
					The self-hosted vault for your companion's health, journal, and daily care.
				</p>
				<div class="flex gap-2 mt-5" aria-hidden="true">
					<span class="w-2.5 h-2.5 rounded-full bg-primary"></span>
					<span class="w-2.5 h-2.5 rounded-full bg-coral"></span>
					<span class="w-2.5 h-2.5 rounded-full bg-gold"></span>
					<span class="w-2.5 h-2.5 rounded-full bg-teal"></span>
				</div>
			</div>

			<!-- Footer line — desktop only -->
			<p class="relative z-10 hidden md:block text-xs text-white/50">
				Your data. Your server. Your companions.
			</p>
		</div>

		<!-- Form panel -->
		<div class="flex flex-col justify-center px-8 py-8 md:px-11 md:py-12 bg-card">
			<!-- Mobile-only tagline (replaces the hidden brand panel text) -->
			<div class="mb-6 md:hidden text-center">
				<p class="text-sm text-muted-foreground">{t(locale, 'page.login.tagline')}</p>
			</div>

			<h2 class="font-display font-bold text-2xl text-foreground mb-1">Welcome back</h2>
			<p class="text-sm text-muted-foreground mb-7">Sign in to pick up where you left off.</p>

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
