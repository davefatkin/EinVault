<script lang="ts">
	import type { Component } from 'svelte';
	import { Plus, BookOpen } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';

	interface Props {
		actions: { key: string; href: string; label: string; highlight: boolean }[];
		icons: Record<string, Component>;
		open: boolean;
	}

	let { actions, icons, open = $bindable() }: Props = $props();

	const locale = getLocale();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
</script>

<div class="flex flex-col items-center flex-1 relative" style="padding-bottom: 8px;">
	{#if open}
		<button
			type="button"
			class="fixed inset-0 z-40 cursor-default"
			onclick={() => (open = false)}
			aria-label={t(locale, 'aria.closeQuickAdd')}
			tabindex="-1"
		></button>
		<div
			class="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden min-w-[200px]"
		>
			{#each actions as action (action.key)}
				{@const ActionIcon = icons[action.key] ?? BookOpen}
				<a
					href={action.href}
					onclick={() => (open = false)}
					class="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent {action.highlight
						? 'bg-primary/10 text-primary font-medium'
						: 'text-foreground'}"
				>
					<ActionIcon
						class="h-4 w-4 shrink-0 {action.highlight ? 'text-primary' : 'text-muted-foreground'}"
					/>
					{action.label}
				</a>
			{/each}
		</div>
	{/if}

	<button
		type="button"
		onclick={() => (open = !open)}
		onkeydown={handleKeydown}
		aria-label={t(locale, 'nav.fab.quickAdd')}
		aria-expanded={open}
		class="relative -top-3 h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
		style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7)); box-shadow: 0 8px 20px hsl(var(--primary) / 0.4);"
	>
		<Plus class="h-6 w-6 transition-transform {open ? 'rotate-45' : ''}" />
	</button>
</div>
