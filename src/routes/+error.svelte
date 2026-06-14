<script lang="ts">
	import { page } from '$app/stores';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';
	import type { MessageKey } from '$lib/i18n';
	import Ein from '$lib/components/Ein.svelte';

	const locale = getLocale();

	const STATUS_KEYS: Record<number, { title: MessageKey; description: MessageKey }> = {
		404: { title: 'page.error.404.title', description: 'page.error.404.description' },
		403: { title: 'page.error.403.title', description: 'page.error.403.description' },
		401: { title: 'page.error.401.title', description: 'page.error.401.description' },
		500: { title: 'page.error.500.title', description: 'page.error.500.description' }
	};

	let status = $derived($page.status);
	let keys = $derived(STATUS_KEYS[status]);
	let title = $derived(keys ? t(locale, keys.title) : t(locale, 'page.error.unexpected.title'));
	let description = $derived(
		keys
			? t(locale, keys.description)
			: ($page.error?.message ?? t(locale, 'page.error.unexpected.description'))
	);
</script>

<svelte:head>
	<title>{status} | EinVault</title>
</svelte:head>

<div class="min-h-screen flex flex-col items-center justify-center px-4 bg-background">
	<div class="w-full max-w-md text-center space-y-6">
		<div class="flex justify-center">
			<Ein pose={status === 404 ? 'confused' : 'sheepish'} class="h-32 w-32" />
		</div>

		<div class="space-y-2">
			<p class="text-5xl font-display font-bold text-primary">{status}</p>
			<h1 class="text-xl font-display font-semibold text-foreground">{title}</h1>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>

		<Card>
			<CardContent class="pt-6 space-y-3">
				{#if status === 401}
					<Button href="/auth/login" class="w-full">{t(locale, 'page.error.signIn')}</Button>
				{:else}
					<Button href="/" class="w-full">{t(locale, 'page.error.goHome')}</Button>
				{/if}
				<Button variant="outline" class="w-full" onclick={() => history.back()}
					>{t(locale, 'page.error.goBack')}</Button
				>
			</CardContent>
		</Card>
	</div>
</div>
