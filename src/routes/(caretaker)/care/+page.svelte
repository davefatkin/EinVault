<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Ein from '$lib/components/Ein.svelte';
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.care.title')} | EinVault</title>
</svelte:head>

<div class="py-20">
	<EmptyState
		size="lg"
		tint="primary"
		title={t(locale, 'page.caretaker.home.noCompanionsHeading')}
		body={t(locale, 'page.caretaker.home.noCompanionsBody')}
	>
		{#snippet illustration()}<Ein pose="happy" tint="primary" class="h-32 w-32" />{/snippet}
	</EmptyState>
</div>
