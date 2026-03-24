<script lang="ts">
	import { badgeVariants, type Variant } from './index.js';
	import { cn } from '$lib/utils.js';

	interface Props {
		variant?: Variant;
		class?: string;
		children?: any;
		[key: string]: any;
	}

	let { variant = 'default', class: className, children, ...restProps }: Props = $props();
</script>

<div class={cn(badgeVariants({ variant }), className)} {...restProps}>
	{@render children?.()}
</div>
