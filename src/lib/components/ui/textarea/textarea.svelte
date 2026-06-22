<script lang="ts">
	import type { HTMLTextareaAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	interface Props extends HTMLTextareaAttributes {
		class?: string;
	}

	let { class: className, ...restProps }: Props = $props();
</script>

<textarea
	class={cn(
		'flex min-h-[80px] w-full rounded-xl border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
	{...restProps}></textarea>
