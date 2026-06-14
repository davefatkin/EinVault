<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';
	import AuthBackdrop from '$lib/components/auth/AuthBackdrop.svelte';

	let { form }: { form: ActionData } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.twofa.setupRequiredTitle')} | EinVault</title>
</svelte:head>

<AuthBackdrop linkLabel={t(locale, 'aria.goToSignIn')}>
	<div class="rounded-2xl border border-border bg-card p-6 shadow-2xl animate-slide-up">
		<h1 class="font-display text-xl font-bold text-foreground mb-4 text-center">
			{t(locale, 'page.twofa.setupRequiredTitle')}
		</h1>

		<p class="text-sm text-muted-foreground mb-6 text-center">
			{t(locale, 'page.twofa.setupRequiredBody')}
		</p>

		{#if form?.totpQr}
			<!-- Mid-enroll: QR shown, awaiting confirmation -->
			<p class="text-sm text-muted-foreground mb-3">{t(locale, 'page.settings.scanQr')}</p>
			<img
				src={String(form.totpQr)}
				alt=""
				class="w-40 h-40 rounded-md border border-border mb-3"
			/>
			<p class="text-sm text-muted-foreground mb-1">{t(locale, 'page.settings.manualKey')}</p>
			<code class="block font-mono text-xs bg-muted rounded px-2 py-1 mb-4 break-all">
				{String(form.totpManualKey ?? '')}
			</code>

			{#if (form as Record<string, unknown>)?.totpError}
				<Alert variant="coral" class="mb-3">
					<AlertDescription>{String((form as Record<string, unknown>).totpError)}</AlertDescription>
				</Alert>
			{/if}

			<form
				method="POST"
				action="?/totpConfirm"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
				class="space-y-3"
			>
				<div class="space-y-1.5">
					<Label for="totp-confirm-code">{t(locale, 'page.settings.confirmCode')}</Label>
					<Input
						id="totp-confirm-code"
						name="code"
						type="text"
						inputmode="numeric"
						pattern="[0-9]*"
						maxlength={6}
						autocomplete="one-time-code"
						aria-label={t(locale, 'page.settings.confirmCode')}
						class="max-w-[180px]"
					/>
				</div>
				<Button type="submit">{t(locale, 'page.settings.confirmEnable')}</Button>
			</form>
		{:else}
			<!-- Initial state: prompt to begin enrollment -->
			{#if form?.totpError}
				<Alert variant="coral" class="mb-4">
					<AlertDescription>{String(form.totpError)}</AlertDescription>
				</Alert>
			{/if}

			<form
				method="POST"
				action="?/totpBegin"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<Button type="submit" class="w-full">{t(locale, 'page.settings.enable2fa')}</Button>
			</form>
		{/if}

		<div class="mt-6 text-center">
			<a href="/auth/logout" class="text-xs text-muted-foreground hover:text-primary underline">
				{t(locale, 'nav.signOut')}
			</a>
		</div>
	</div>
</AuthBackdrop>
