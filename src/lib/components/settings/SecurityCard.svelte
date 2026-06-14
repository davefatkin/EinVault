<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		totpEnabled,
		available,
		enforced,
		form
	}: {
		totpEnabled: boolean;
		available: boolean;
		enforced: boolean;
		form: Record<string, unknown> | null | undefined;
	} = $props();

	const locale = getLocale();

	const backupCodes = $derived(
		Array.isArray(form?.totpBackupCodes) ? (form.totpBackupCodes as string[]) : null
	);

	let codesCopied = $state(false);

	function copyCodesText(): string {
		return backupCodes?.join('\n') ?? '';
	}

	async function handleCopy() {
		if (!backupCodes) return;
		await navigator.clipboard.writeText(copyCodesText());
		codesCopied = true;
		setTimeout(() => (codesCopied = false), 2000);
	}

	function handleDownload() {
		if (!backupCodes) return;
		const blob = new Blob([copyCodesText()], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'einvault-backup-codes.txt';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'page.settings.securityCard')}</CardTitle>
	</CardHeader>
	<CardContent>
		{#if !available}
			<p class="text-sm text-muted-foreground">{t(locale, 'page.settings.twofaUnavailable')}</p>
		{:else if backupCodes}
			<!-- State 4: backup codes just generated (after confirm or regen) -->
			<h3 class="text-sm font-semibold mb-1">{t(locale, 'page.settings.backupCodesTitle')}</h3>
			<p class="text-sm text-muted-foreground mb-3">
				{t(locale, 'page.settings.backupCodesIntro')}
			</p>
			<div
				class="grid grid-cols-2 gap-1.5 font-mono text-sm bg-muted rounded-md p-3 mb-3 select-all"
			>
				{#each backupCodes as code (code)}
					<span>{code}</span>
				{/each}
			</div>
			<div class="flex gap-2 mb-4">
				<Button variant="outline" size="sm" onclick={handleCopy}>
					{codesCopied ? '✓ Copied' : 'Copy'}
				</Button>
				<Button variant="outline" size="sm" onclick={handleDownload}>Download</Button>
			</div>
			<Button variant="secondary" size="sm" onclick={() => location.reload()}>
				{t(locale, 'page.settings.backupCodesSaved')}
			</Button>
		{:else if form?.totpQr && !form?.totpSuccess}
			<!-- State 3: mid-enroll — QR shown, awaiting confirmation -->
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

			{#if form?.totpError}
				<Alert variant="coral" class="mb-3">
					<AlertDescription>{String(form.totpError)}</AlertDescription>
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
		{:else if !totpEnabled}
			<!-- State 2: 2FA off, not mid-enroll -->
			<p class="text-sm text-muted-foreground mb-4">{t(locale, 'page.settings.twofaOff')}</p>
			<form
				method="POST"
				action="?/totpBegin"
				use:enhance={() =>
					async ({ update }) =>
						update({ reset: false })}
			>
				<Button type="submit">{t(locale, 'page.settings.enable2fa')}</Button>
			</form>
		{:else}
			<!-- State 5: 2FA on -->
			{#if form?.totpSuccess}
				<Alert variant="success" class="mb-4">
					<AlertDescription>{t(locale, 'page.settings.twofaUpdated')}</AlertDescription>
				</Alert>
			{/if}
			{#if form?.totpError}
				<Alert variant="coral" class="mb-4">
					<AlertDescription>{String(form.totpError)}</AlertDescription>
				</Alert>
			{/if}

			<p class="text-sm font-medium mb-4">{t(locale, 'page.settings.twofaOn')}</p>

			<div class="space-y-4">
				<form
					method="POST"
					action="?/totpRegenerate"
					use:enhance={() =>
						async ({ update }) =>
							update({ reset: false })}
					class="space-y-3"
				>
					<div class="space-y-1.5">
						<Label for="totp-regen-code">{t(locale, 'page.settings.confirmCode')}</Label>
						<Input
							id="totp-regen-code"
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
					<Button variant="outline" size="sm" type="submit">
						{t(locale, 'page.settings.regenBackup')}
					</Button>
				</form>

				{#if enforced}
					<p class="text-sm text-muted-foreground">
						{t(locale, 'page.twofa.cannotDisableEnforced')}
					</p>
				{:else}
					<form
						method="POST"
						action="?/totpDisable"
						use:enhance={() =>
							async ({ update }) =>
								update({ reset: false })}
						class="space-y-3"
					>
						<div class="space-y-1.5">
							<Label for="totp-disable-code">{t(locale, 'page.settings.confirmCode')}</Label>
							<Input
								id="totp-disable-code"
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
						<Button variant="coral" size="sm" type="submit">
							{t(locale, 'page.settings.disable2fa')}
						</Button>
					</form>
				{/if}
			</div>
		{/if}
	</CardContent>
</Card>
