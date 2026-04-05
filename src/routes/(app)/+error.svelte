<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CircleAlert } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();
</script>

<div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
	<CircleAlert class="h-12 w-12 text-destructive" />
	<div>
		<h1 class="text-2xl font-semibold">{$page.status}</h1>
		<p class="mt-1 text-muted-foreground">
			{$page.error?.message ?? t(locale, 'page.error.unexpected.description')}
		</p>
	</div>
	<Button href="/" variant="outline">{t(locale, 'page.error.goHome')}</Button>
</div>
