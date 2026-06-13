<script lang="ts">
	import type { Snippet } from 'svelte';
	import { emptyStateCircleClass, type EmptyTint } from './emptyState';

	interface Props {
		title: string;
		body?: string;
		tint?: EmptyTint;
		size?: 'sm' | 'default' | 'lg';
		icon: Snippet;
		action?: Snippet;
	}

	let { title, body, tint = 'primary', size = 'default', icon, action }: Props = $props();

	const isLg = $derived(size === 'lg');
	const isSm = $derived(size === 'sm');
</script>

<div class="flex flex-col items-center text-center px-6 {isLg ? 'py-14' : isSm ? 'py-6' : 'py-10'}">
	<div
		class="flex items-center justify-center rounded-full {isLg
			? 'h-16 w-16 bg-brand-gradient text-white shadow-lg'
			: `${isSm ? 'h-10 w-10' : 'h-12 w-12'} ${emptyStateCircleClass(tint)}`}"
	>
		{@render icon()}
	</div>
	<p
		role="heading"
		aria-level={isLg ? 2 : 3}
		class="mt-3 text-foreground {isLg
			? 'font-display text-2xl font-bold'
			: isSm
				? 'text-sm font-medium'
				: 'text-base font-medium'}"
	>
		{title}
	</p>
	{#if body}
		<p class="mt-1.5 max-w-[42ch] text-sm text-muted-foreground">{body}</p>
	{/if}
	{#if action}
		<div class="mt-5">{@render action()}</div>
	{/if}
</div>
