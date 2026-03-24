<script lang="ts">
	import { cn } from '$lib/utils.js';
	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: any; [key: string]: any } = $props();
</script>

<h3 class={cn('text-lg font-semibold leading-none tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
