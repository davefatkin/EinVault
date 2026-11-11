<script lang="ts">
	import { t, getLocale } from '#lib/i18n/index.js';
	import { formatAmount } from '#lib/supplies.js';

	// One muted line saying what Done does on a dose reminder. Without a counted
	// supply (or for caretakers, who never see supplies) it only says it logs a dose.
	let {
		supply = null,
		class: className = ''
	}: { supply?: { name: string; unit: string | null; units: number } | null; class?: string } =
		$props();
	const locale = getLocale();

	const text = $derived.by(() => {
		if (!supply) return t(locale, 'common.reminder.doneLogsDose');
		const amount = formatAmount(locale, supply.units);
		return t(locale, 'common.reminder.doneLogsDoseSupply', {
			units: supply.unit ? `${amount} ${supply.unit}` : amount,
			supply: supply.name
		});
	});
</script>

<p class="text-xs text-muted-foreground {className}">{text}</p>
