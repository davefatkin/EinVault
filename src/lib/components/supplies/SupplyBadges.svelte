<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { SupplySummary } from '#lib/supplies.js';

	// Running low and Expiring show whether or not warnings are on; "Warnings
	// off" says why no notification will come.
	let { supply }: { supply: Pick<SupplySummary, 'runningLow' | 'expiring' | 'alertsEnabled'> } =
		$props();
	const locale = getLocale();
</script>

{#if supply.runningLow}
	<Badge variant="gold">{t(locale, 'page.supplies.badgeRunningLow')}</Badge>
{/if}
{#if supply.expiring}
	<Badge variant="coral">{t(locale, 'page.supplies.badgeExpiring')}</Badge>
{/if}
{#if !supply.alertsEnabled}
	<Badge variant="secondary">{t(locale, 'page.supplies.badgeWarningsOff')}</Badge>
{/if}
