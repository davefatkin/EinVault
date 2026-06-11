<script lang="ts">
	import { cn } from '$lib/utils.js';
	let {
		class: className,
		children,
		...restProps
	}: { class?: string; children?: any; [key: string]: any } = $props();
</script>

<div
	class={cn('rounded-2xl border border-border bg-card text-card-foreground shadow-sm', className)}
	{...restProps}
>
	{@render children?.()}
</div>
