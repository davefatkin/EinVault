<script lang="ts">
	import type { PageData } from './$types';
	import CaretakerSheet from '$lib/components/CaretakerSheet.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data }: { data: PageData } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{data.sheet.companion.name} | {t(locale, 'page.sheet.title')} | EinVault</title>
</svelte:head>

<CaretakerSheet sheet={data.sheet} printedOn={data.printedOn} />
