<script lang="ts">
	import { page } from '$app/stores';
	import { Card, CardContent } from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';
	import type { MessageKey } from '$lib/i18n';

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
		<div>
			<svg
				class="w-16 h-16 mx-auto text-muted-foreground"
				viewBox="0 0 419.14 403.6"
				fill="currentColor"
				aria-hidden="true"
			>
				<path
					d="m281.78 0c-0.88 0.011-1.79 0.055-2.69 0.125-35.82 6.184-55.52 44.064-58.37 77.469-4.17 30.316 9.19 69.266 42.47 76.066 4.83 0.92 9.84 0.5 14.56-0.78 40.08-13.44 58.01-60.908 52.22-100.22-1.69-25.396-20.83-53.009-48.19-52.66zm-151.87 1.625c-22.28 0.547-39.63 23.138-43.16 44.375-7.441 42.074 11.698 94.35 55.53 107.66 4.11 0.89 8.35 0.98 12.5 0.34 29.63-4.94 42.18-38.15 40.94-64.969-0.89-35.372-19.27-76.273-56-86.218-3.36-0.891-6.63-1.266-9.81-1.188zm248.93 119.5c-38.53 2.31-64.95 40.76-68.72 76.66-5.09 25.89 8.71 60.53 38.26 62.6 41.19-0.51 69.3-44.53 70.46-82.41 2.61-25.05-12.15-55.46-40-56.85zm-337.28 8.54c-16.394-0.14-32.517 9.68-37.874 26.34-14.293 44.58 14.408 101.04 61.624 110.41 19.706 3.37 37.018-11.76 41.908-29.97 10.35-38.95-10.915-84.17-46.908-101.85-5.863-3.29-12.334-4.88-18.75-4.93zm172.75 79.93c-32.14 0.07-64.78 16.38-85.59 40.66-22.48 28.3-40.892 61.23-48.095 96.94-8.751 25.7 11.083 55.29 38.565 55.47 33.06 0.91 61.47-21.79 94.34-23.47 27.89-4.25 52.86 10.25 77.94 19.75 21.35 9.13 50.85 5.63 61.75-17.35 8.57-23.41-4.05-48.39-14.5-69.18-21.32-33.76-44.17-69.24-79.13-90.32-14.01-8.68-29.58-12.53-45.28-12.5z"
				/>
			</svg>
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
