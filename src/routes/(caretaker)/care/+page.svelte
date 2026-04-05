<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.care.title')} | EinVault</title>
</svelte:head>

<div class="flex flex-col items-center justify-center py-20 text-center px-4">
	<p class="text-4xl mb-4">🐾</p>
	<h1 class="text-xl font-semibold text-foreground mb-2">
		{t(locale, 'page.caretaker.home.noCompanionsHeading')}
	</h1>
	<p class="text-sm text-muted-foreground max-w-xs">
		{t(locale, 'page.caretaker.home.noCompanionsBody')}
	</p>
</div>
