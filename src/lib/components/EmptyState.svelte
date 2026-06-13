<script lang="ts">
	import type { Snippet } from 'svelte';
	import { emptyStateCircleClass, type EmptyTint } from './emptyState';

	interface Props {
		title: string;
		body?: string;
		tint?: EmptyTint;
		size?: 'default' | 'lg';
		icon: Snippet;
		action?: Snippet;
	}

	let { title, body, tint = 'primary', size = 'default', icon, action }: Props = $props();
</script>

<div class="flex flex-col items-center text-center px-6 {size === 'lg' ? 'py-14' : 'py-10'}">
	<div
		class="flex items-center justify-center rounded-full {size === 'lg'
			? 'h-16 w-16 bg-brand-gradient text-white shadow-lg'
			: `h-12 w-12 ${emptyStateCircleClass(tint)}`}"
	>
		{@render icon()}
	</div>
	<p
		class="mt-4 text-foreground {size === 'lg'
			? 'font-display text-2xl font-bold'
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
