<script lang="ts">
	import type { PageData } from './$types';
	import CaretakerSheet from '#lib/components/CaretakerSheet.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{data.sheet.companion.name} | {t(locale, 'page.sheet.title')} | EinVault</title>
</svelte:head>

{#key data.sheet.companion.id}
	<CaretakerSheet sheet={data.sheet} printedOn={data.printedOn} shell="app" />
{/key}
