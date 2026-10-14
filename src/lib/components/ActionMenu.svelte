<script lang="ts" module>
	import type { Component } from 'svelte';

	export type ActionMenuItem = {
		label: string;
		icon?: Component<{ class?: string }>;
		onselect: () => void;
		/** Draw a divider above this item. */
		separated?: boolean;
	};
</script>

<script lang="ts">
	import { tick } from 'svelte';
	import { Plus } from '@lucide/svelte';

	// A "+ label" button that opens a menu of actions. Arrow keys, Home and
	// End move between items; Escape closes and returns focus to the button.
	let { label, items }: { label: string; items: ActionMenuItem[] } = $props();

	const menuId = `menu-${Math.random().toString(36).slice(2)}`;
	let open = $state(false);
	let rootEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let menuEl = $state<HTMLElement | null>(null);

	const menuItems = () =>
		Array.from(menuEl?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

	async function show(focus: 'first' | 'last' = 'first') {
		open = true;
		await tick();
		const list = menuItems();
		(focus === 'first' ? list[0] : list[list.length - 1])?.focus();
	}

	function hide(refocus = true) {
		open = false;
		if (refocus) triggerEl?.focus();
	}

	function choose(item: ActionMenuItem) {
		// Close first, so a dialog the item opens takes focus from the button
		// and returns it there.
		hide();
		item.onselect();
	}

	function onMenuKey(e: KeyboardEvent) {
		const list = menuItems();
		const i = list.indexOf(document.activeElement as HTMLElement);
		const focusAt = (n: number) => list[(n + list.length) % list.length]?.focus();
		if (e.key === 'ArrowDown') focusAt(i + 1);
		else if (e.key === 'ArrowUp') focusAt(i - 1);
		else if (e.key === 'Home') focusAt(0);
		else if (e.key === 'End') focusAt(list.length - 1);
		else if (e.key === 'Escape') {
			e.stopPropagation();
			hide();
		} else if (e.key === 'Tab') {
			hide(false);
			return;
		} else return;
		e.preventDefault();
	}

	function onWindowPointer(e: PointerEvent) {
		if (open && rootEl && !rootEl.contains(e.target as Node)) hide(false);
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="relative" bind:this={rootEl}>
	<button
		bind:this={triggerEl}
		type="button"
		aria-haspopup="menu"
		aria-expanded={open}
		aria-controls={open ? menuId : undefined}
		onclick={() => (open ? hide() : show())}
		onkeydown={(e) => {
			if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
				e.preventDefault();
				show(e.key === 'ArrowDown' ? 'first' : 'last');
			}
		}}
		class="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
	>
		<Plus class="h-3.5 w-3.5" />{label}
	</button>
	{#if open}
		<div
			bind:this={menuEl}
			id={menuId}
			role="menu"
			aria-label={label}
			tabindex="-1"
			onkeydown={onMenuKey}
			class="absolute right-0 top-full z-30 mt-1 w-56 rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
		>
			{#each items as item (item.label)}
				{#if item.separated}<div role="separator" class="my-1 h-px bg-border"></div>{/if}
				<button
					type="button"
					role="menuitem"
					tabindex="-1"
					onclick={() => choose(item)}
					class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-accent focus:bg-accent focus:outline-none"
				>
					{#if item.icon}<item.icon class="h-4 w-4 text-muted-foreground" />{/if}
					{item.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
