<script lang="ts">
	import { Badge, type Variant } from '#lib/components/ui/badge/index.js';
	import { severityLabel } from '#lib/i18n/labels.js';
	import { getLocale } from '#lib/i18n/index.js';
	import type { Severity } from '#lib/incidents.js';

	let {
		severity,
		class: className = '',
		...rest
	}: { severity: Severity; class?: string; [key: string]: unknown } = $props();
	const locale = getLocale();

	const VARIANT: Record<Severity, Variant> = { mild: 'teal', moderate: 'gold', severe: 'coral' };
</script>

<Badge variant={VARIANT[severity]} class={className} {...rest}
	>{severityLabel(locale, severity)}</Badge
>
