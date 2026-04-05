<script lang="ts">
	import type { ActionData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
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
	<title>{t(locale, 'page.login.title')} | EinVault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-background">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<a href="/" class="inline-flex items-center gap-2 justify-center mb-2">
				<svg
					class="w-9 h-9 text-primary"
					viewBox="0 0 419.14 403.6"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						d="m281.78 0c-0.88 0.011-1.79 0.055-2.69 0.125-35.82 6.184-55.52 44.064-58.37 77.469-4.17 30.316 9.19 69.266 42.47 76.066 4.83 0.92 9.84 0.5 14.56-0.78 40.08-13.44 58.01-60.908 52.22-100.22-1.69-25.396-20.83-53.009-48.19-52.66zm-151.87 1.625c-22.28 0.547-39.63 23.138-43.16 44.375-7.441 42.074 11.698 94.35 55.53 107.66 4.11 0.89 8.35 0.98 12.5 0.34 29.63-4.94 42.18-38.15 40.94-64.969-0.89-35.372-19.27-76.273-56-86.218-3.36-0.891-6.63-1.266-9.81-1.188zm248.93 119.5c-38.53 2.31-64.95 40.76-68.72 76.66-5.09 25.89 8.71 60.53 38.26 62.6 41.19-0.51 69.3-44.53 70.46-82.41 2.61-25.05-12.15-55.46-40-56.85zm-337.28 8.54c-16.394-0.14-32.517 9.68-37.874 26.34-14.293 44.58 14.408 101.04 61.624 110.41 19.706 3.37 37.018-11.76 41.908-29.97 10.35-38.95-10.915-84.17-46.908-101.85-5.863-3.29-12.334-4.88-18.75-4.93zm172.75 79.93c-32.14 0.07-64.78 16.38-85.59 40.66-22.48 28.3-40.892 61.23-48.095 96.94-8.751 25.7 11.083 55.29 38.565 55.47 33.06 0.91 61.47-21.79 94.34-23.47 27.89-4.25 52.86 10.25 77.94 19.75 21.35 9.13 50.85 5.63 61.75-17.35 8.57-23.41-4.05-48.39-14.5-69.18-21.32-33.76-44.17-69.24-79.13-90.32-14.01-8.68-29.58-12.53-45.28-12.5z"
					/>
				</svg>
				<span class="font-display text-3xl font-bold text-primary">EinVault</span>
			</a>
			<p class="text-sm text-muted-foreground">{t(locale, 'page.login.tagline')}</p>
		</div>

		<Card class="animate-slide-up">
			<CardContent class="pt-6">
				<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
					{#if form?.error}
						<Alert variant="destructive">
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
					</div>

					<Button type="submit" class="w-full" disabled={loading}>
						{loading ? t(locale, 'page.login.signingIn') : t(locale, 'page.login.signIn')}
					</Button>
				</form>
			</CardContent>
		</Card>

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
