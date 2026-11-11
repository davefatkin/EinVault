<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label,
		inert = false,
		children
	}: {
		label: string;
		/** Set while a sheet above the bar is open (More). */
		inert?: boolean;
		children: Snippet;
	} = $props();
</script>

<!-- While inert, the bar draws above the sheet and its scrim (z-45) so the
     quick-add button is not cut off by the sheet; taps on it fall through to
     the scrim, which closes the sheet. -->
<nav
	aria-label={label}
	{inert}
	class="fixed bottom-0 inset-x-0 {inert
		? 'z-[46]'
		: 'z-40'} border-t border-border bg-card pb-safe md:hidden print:hidden"
>
	<div class="relative flex items-end">
		{@render children()}
	</div>
</nav>
