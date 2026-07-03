<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { t, getLocale } from '$lib/i18n';

	interface TokenRow {
		id: string;
		name: string;
		scope: 'full' | 'write';
		createdAt: Date | string;
		expiresAt: Date | string | null;
		lastUsedAt: Date | string | null;
	}

	function isExpired(expiresAt: Date | string | null): boolean {
		if (!expiresAt) return false;
		return new Date(expiresAt).getTime() <= Date.now();
	}

	let {
		tokens,
		apiAccessEnabled,
		form
	}: {
		tokens: TokenRow[];
		apiAccessEnabled: boolean;
		form: { apiTokenRaw?: string; apiTokenError?: string } | null;
	} = $props();

	const locale = getLocale();

	let copied = $state(false);

	// Reset the confirmation whenever a freshly created token is shown.
	$effect(() => {
		form?.apiTokenRaw;
		copied = false;
	});

	async function copyToken() {
		const value = form?.apiTokenRaw ?? '';
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			return;
		} catch {
			// Clipboard API is undefined over plain http:// (non-secure LAN contexts).
			// Fall back to selecting the field and the legacy copy command.
			const input = document.getElementById('api-token-raw') as HTMLInputElement | null;
			if (input) {
				input.focus();
				input.select();
				try {
					copied = document.execCommand('copy');
				} catch {
					copied = false;
				}
			}
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>{t(locale, 'settings.apiTokens.title')}</CardTitle>
	</CardHeader>
	<CardContent class="space-y-4">
		<p class="text-sm text-muted-foreground">{t(locale, 'settings.apiTokens.description')}</p>

		{#if !apiAccessEnabled}
			<Alert>
				<AlertDescription class="text-xs">
					{t(locale, 'settings.apiTokens.accessRevoked')}
				</AlertDescription>
			</Alert>
		{:else}
			{#if form?.apiTokenRaw}
				<div class="space-y-2">
					<p class="text-xs text-muted-foreground font-medium">
						{t(locale, 'settings.apiTokens.newToken')}
					</p>
					<div class="flex items-center gap-2">
						<Input
							id="api-token-raw"
							type="text"
							readonly
							value={form.apiTokenRaw}
							aria-label={t(locale, 'settings.apiTokens.tokenFieldLabel')}
							class="font-mono text-xs"
						/>
						<Button type="button" variant="outline" size="sm" onclick={copyToken}>
							{t(locale, 'settings.apiTokens.copy')}
						</Button>
					</div>
					<p aria-live="polite" class="text-xs text-teal">
						{#if copied}
							{t(locale, 'settings.apiTokens.copied')}
						{/if}
					</p>
					<Alert>
						<AlertDescription class="text-xs"
							>{t(locale, 'settings.apiTokens.revealOnce')}</AlertDescription
						>
					</Alert>
				</div>
			{/if}

			{#if form?.apiTokenError}
				<p role="alert" class="text-sm text-coral">{form.apiTokenError}</p>
			{/if}

			<form
				method="POST"
				action="?/apiTokenCreate"
				class="flex flex-wrap items-end gap-2"
				use:enhance
			>
				<div class="flex flex-col gap-1">
					<label for="api-token-name" class="text-xs text-muted-foreground">
						{t(locale, 'settings.apiTokens.nameLabel')}
					</label>
					<Input
						id="api-token-name"
						type="text"
						name="name"
						maxlength={60}
						required
						placeholder={t(locale, 'settings.apiTokens.namePlaceholder')}
						class="max-w-[240px] h-9 text-sm"
					/>
				</div>
				<div class="flex flex-col gap-1">
					<label for="api-token-scope" class="text-xs text-muted-foreground">
						{t(locale, 'settings.apiTokens.scopeLabel')}
					</label>
					<select
						id="api-token-scope"
						name="scope"
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
					>
						<option value="full">{t(locale, 'settings.apiTokens.scopeFull')}</option>
						<option value="write">{t(locale, 'settings.apiTokens.scopeWrite')}</option>
					</select>
				</div>
				<div class="flex flex-col gap-1">
					<label for="api-token-expiry" class="text-xs text-muted-foreground">
						{t(locale, 'settings.apiTokens.expiryLabel')}
					</label>
					<select
						id="api-token-expiry"
						name="expiresInDays"
						class="h-9 rounded-md border border-input bg-background px-2 text-sm"
					>
						<option value="">{t(locale, 'settings.apiTokens.expiryNever')}</option>
						<option value="30">{t(locale, 'settings.apiTokens.expiry30')}</option>
						<option value="90">{t(locale, 'settings.apiTokens.expiry90')}</option>
						<option value="365">{t(locale, 'settings.apiTokens.expiry365')}</option>
					</select>
				</div>
				<Button type="submit" size="sm" class="h-9">{t(locale, 'settings.apiTokens.create')}</Button
				>
			</form>
		{/if}

		{#if tokens.length > 0}
			<div class="divide-y divide-border rounded-lg border">
				{#each tokens as token (token.id)}
					<div class="flex items-center gap-3 px-3 py-2 text-sm">
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2">
								<p class="font-medium truncate">{token.name}</p>
								<span
									class="shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
								>
									{token.scope === 'write'
										? t(locale, 'settings.apiTokens.scopeWrite')
										: t(locale, 'settings.apiTokens.scopeFull')}
								</span>
							</div>
							<p class="text-xs text-muted-foreground">
								{t(locale, 'settings.apiTokens.created')}
								<LocalTime date={token.createdAt} format="date" />
								·
								{t(locale, 'settings.apiTokens.lastUsed')}
								{#if token.lastUsedAt}
									<LocalTime date={token.lastUsedAt} format="relative" />
								{:else}
									{t(locale, 'settings.apiTokens.never')}
								{/if}
								{#if token.expiresAt}
									·
									{#if isExpired(token.expiresAt)}
										<span class="text-coral">{t(locale, 'settings.apiTokens.expired')}</span>
									{:else}
										{t(locale, 'settings.apiTokens.expires')}
										<LocalTime date={token.expiresAt} format="date" />
									{/if}
								{/if}
							</p>
						</div>
						<form method="POST" action="?/apiTokenRotate" use:enhance>
							<input type="hidden" name="id" value={token.id} />
							<Button type="submit" variant="outline" size="sm">
								{t(locale, 'settings.apiTokens.rotate')}
							</Button>
						</form>
						<form method="POST" action="?/apiTokenRevoke" use:enhance>
							<input type="hidden" name="id" value={token.id} />
							<Button type="submit" variant="softDestructive" size="sm">
								{t(locale, 'settings.apiTokens.revoke')}
							</Button>
						</form>
					</div>
				{/each}
			</div>
		{:else if apiAccessEnabled}
			<p class="text-xs text-muted-foreground">{t(locale, 'settings.apiTokens.empty')}</p>
		{/if}
	</CardContent>
</Card>
