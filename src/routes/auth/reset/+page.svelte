<script lang="ts">
	import { page } from '$app/state';
	import type { ActionData, PageData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';

	let { form, data }: { form: ActionData; data: PageData } = $props();
	let loading = $state(false);
	const locale = getLocale();

	const token = $derived(page.url.searchParams.get('token') ?? '');
</script>

<svelte:head>
	<title>{t(locale, 'page.reset.title')} | EinVault</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center p-4 bg-background">
	<div class="w-full max-w-sm">
		<div class="text-center mb-8">
			<h1 class="font-display text-2xl font-bold text-primary">
				{t(locale, 'page.reset.title')}
			</h1>
		</div>

		<Card class="animate-slide-up">
			<CardContent class="pt-6">
				{#if form?.success}
					<Alert>
						<AlertDescription>{t(locale, 'page.reset.success')}</AlertDescription>
					</Alert>
					<div class="mt-4 text-center">
						<a href="/auth/login" class="text-sm text-primary underline">
							{t(locale, 'page.forgot.backToLogin')}
						</a>
					</div>
				{:else if !data.valid && !form?.error}
					<Alert variant="destructive">
						<AlertDescription>{t(locale, 'page.reset.invalid')}</AlertDescription>
					</Alert>
					<div class="mt-4 text-center">
						<a href="/auth/forgot" class="text-sm text-primary underline">
							{t(locale, 'page.reset.requestNew')}
						</a>
					</div>
				{:else}
					<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
						{#if form?.error}
							<Alert variant="destructive">
								<AlertDescription>{form.error}</AlertDescription>
							</Alert>
						{/if}

						<input type="hidden" name="token" value={token} />

						<div class="space-y-1.5">
							<Label for="newPassword">{t(locale, 'page.reset.newPasswordLabel')}</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								required
								minlength={8}
								maxlength={128}
								autocomplete="new-password"
							/>
						</div>

						<div class="space-y-1.5">
							<Label for="confirmPassword">{t(locale, 'page.reset.confirmPasswordLabel')}</Label>
							<Input
								id="confirmPassword"
								name="confirmPassword"
								type="password"
								required
								minlength={8}
								maxlength={128}
								autocomplete="new-password"
							/>
						</div>

						<Button type="submit" class="w-full" disabled={loading}>
							{loading ? t(locale, 'page.reset.saving') : t(locale, 'page.reset.submit')}
						</Button>
					</form>
				{/if}
			</CardContent>
		</Card>
	</div>
</div>
