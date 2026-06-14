<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import BackupCodes from '$lib/components/BackupCodes.svelte';
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
			<BackupCodes codes={backupCodes} />
			<Button variant="secondary" size="sm" class="mt-4" onclick={() => location.reload()}>
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
