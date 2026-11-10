<script lang="ts">
	import type { Snippet } from 'svelte';

	let { label, children }: { label: string; children: Snippet } = $props();
</script>

<nav
	aria-label={label}
	class="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card pb-safe md:hidden print:hidden"
>
	<div class="relative flex items-end">
		{@render children()}
	</div>
</nav>
