<script lang="ts">
	import type { ActionData } from './$types';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';
	import AuthBackdrop from '$lib/components/auth/AuthBackdrop.svelte';

	let { form }: { form: ActionData } = $props();
	let loading = $state(false);
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.forgot.title')} | EinVault</title>
</svelte:head>

<AuthBackdrop>
	<div class="rounded-2xl border border-border bg-card p-6 shadow-2xl animate-slide-up">
		<h1 class="font-display text-xl font-bold text-foreground mb-4 text-center">
			{t(locale, 'page.forgot.title')}
		</h1>
		{#if form?.success}
			<Alert>
				<AlertDescription>{t(locale, 'page.forgot.success')}</AlertDescription>
			</Alert>
		{:else}
			<form method="POST" onsubmit={() => (loading = true)} class="space-y-4">
				{#if form?.error}
					<Alert variant="destructive">
						<AlertDescription>{form.error}</AlertDescription>
					</Alert>
				{/if}

				<p class="text-sm text-muted-foreground">{t(locale, 'page.forgot.instruction')}</p>

				<div class="space-y-1.5">
					<Label for="email">{t(locale, 'page.forgot.emailLabel')}</Label>
					<Input id="email" name="email" type="email" required autocomplete="email" />
				</div>

				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? t(locale, 'page.forgot.sending') : t(locale, 'page.forgot.submit')}
				</Button>
			</form>
		{/if}

		<div class="mt-4 text-center">
			<a href="/auth/login" class="text-xs text-muted-foreground hover:text-primary underline">
				{t(locale, 'page.forgot.backToLogin')}
			</a>
		</div>
	</div>
</AuthBackdrop>
