<script lang="ts">
	import { Pill } from '@lucide/svelte';
	import { badgeVariants } from '#lib/components/ui/badge/index.js';
	import { cn } from '#lib/utils.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// A small link to the medication a record belongs to, e.g. a dose reminder's.
	let { name, href }: { name: string; href: string } = $props();
	const locale = getLocale();
</script>

<a
	{href}
	aria-label={t(locale, 'page.medications.linkLabel', { name })}
	class={cn(
		badgeVariants({ variant: 'outline' }),
		'max-w-full gap-1 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
	)}
>
	<Pill class="h-3 w-3 shrink-0" aria-hidden="true" />
	<span class="max-w-48 truncate">{name}</span>
</a>
