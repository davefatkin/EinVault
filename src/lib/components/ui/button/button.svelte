<script lang="ts">
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';
	import { buttonVariants, type Variant, type Size } from './index.js';
	import { cn } from '$lib/utils.js';

	type Props = (HTMLButtonAttributes | HTMLAnchorAttributes) & {
		variant?: Variant;
		size?: Size;
		class?: string;
		href?: string;
	};

	let {
		variant = 'default',
		size = 'default',
		class: className,
		href,
		children,
		...restProps
	}: Props = $props();

	const classes = $derived(cn(buttonVariants({ variant, size }), className));
</script>

{#if href}
	<a {href} class={classes} {...restProps as HTMLAnchorAttributes}>
		{@render children?.()}
	</a>
{:else}
	<button class={classes} {...restProps as HTMLButtonAttributes}>
		{@render children?.()}
	</button>
{/if}
