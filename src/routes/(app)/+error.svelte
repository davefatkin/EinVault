<script lang="ts">
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import Ein from '$lib/components/Ein.svelte';
	import { t, getLocale } from '$lib/i18n';

	const locale = getLocale();
</script>

<div class="flex flex-col items-center justify-center gap-4 py-16 text-center">
	<Ein pose={$page.status === 404 ? 'confused' : 'sheepish'} class="h-28 w-28" />
	<div>
		<h1 class="text-2xl font-semibold">{$page.status}</h1>
		<p class="mt-1 text-muted-foreground">
			{$page.error?.message ?? t(locale, 'page.error.unexpected.description')}
		</p>
	</div>
	<Button href="/" variant="outline">{t(locale, 'page.error.goHome')}</Button>
</div>
