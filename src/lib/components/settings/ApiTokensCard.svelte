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
		createdAt: Date | string;
		lastUsedAt: Date | string | null;
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
						<Input type="text" readonly value={form.apiTokenRaw} class="font-mono text-xs" />
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={() => navigator.clipboard.writeText(form?.apiTokenRaw ?? '')}
						>
							{t(locale, 'settings.apiTokens.copy')}
						</Button>
					</div>
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

			<form method="POST" action="?/apiTokenCreate" class="flex items-center gap-2" use:enhance>
				<Input
					type="text"
					name="name"
					maxlength={60}
					required
					placeholder={t(locale, 'settings.apiTokens.namePlaceholder')}
					class="max-w-[240px] h-9 text-sm"
				/>
				<Button type="submit" size="sm">{t(locale, 'settings.apiTokens.create')}</Button>
			</form>
		{/if}

		{#if tokens.length > 0}
			<div class="divide-y divide-border rounded-lg border">
				{#each tokens as token (token.id)}
					<div class="flex items-center gap-3 px-3 py-2 text-sm">
						<div class="flex-1 min-w-0">
							<p class="font-medium truncate">{token.name}</p>
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
							</p>
						</div>
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
