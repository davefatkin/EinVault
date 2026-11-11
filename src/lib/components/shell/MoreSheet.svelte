<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		OWNER_SECTIONS,
		NAV_GROUP_LABELS,
		isSectionActive,
		sectionHref
	} from '#lib/nav/sections.js';
	import { NAV_ICONS } from '#lib/nav/icons.js';
	import { trapTab } from '#lib/focusTrap.js';

	interface Props {
		companionId: string;
		open: boolean;
		/** Focus the More tab; called only when the sheet is dismissed without navigating. */
		returnFocus: () => void;
	}

	let { companionId, open = $bindable(), returnFocus }: Props = $props();

	const locale = getLocale();
	const headingId = $props.id();

	// The sheet sits on top of the bottom bar: its inner row is 56px tall plus a
	// 1px top border, and the bar pads itself by the safe-area inset.
	const ABOVE_BAR = 'calc(3.5rem + 1px + env(safe-area-inset-bottom, 0px))';
	// On a landscape phone the sheet is taller than the room above the bar (and
	// below the demo banner, when there is one); it scrolls instead.
	const MAX_HEIGHT = `calc(100dvh - ${ABOVE_BAR} - var(--demo-bar-h, 0px))`;

	const groups = (['health', 'records'] as const).map((group) => ({
		group,
		sections: OWNER_SECTIONS.filter((s) => s.mobile === 'more' && s.group === group)
	}));

	let dialogEl = $state<HTMLElement | null>(null);

	function dismiss() {
		open = false;
		// The bar is inert until the sheet unmounts; focus it after that.
		tick().then(returnFocus);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			dismiss();
			return;
		}
		if (dialogEl) trapTab(dialogEl, e);
	}

	$effect(() => {
		if (!open) return;
		tick().then(() => dialogEl?.querySelector<HTMLElement>('a[href]')?.focus());
	});

	$effect(() => {
		void page.url.pathname; // close after every navigation
		open = false;
	});
</script>

{#if open}
	<!-- Dims the page above the bar; catches taps on the bar too, so a tap there
	     closes the sheet instead of reaching the page behind the inert bar. -->
	<button
		type="button"
		class="fixed inset-0 z-[45] cursor-default md:hidden print:hidden"
		aria-hidden="true"
		tabindex="-1"
		onclick={dismiss}
	>
		<span class="absolute inset-x-0 top-0 bg-black/40" style:bottom={ABOVE_BAR}></span>
	</button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-label={t(locale, 'aria.moreSections')}
		tabindex="-1"
		{onkeydown}
		class="fixed inset-x-0 z-[45] overflow-y-auto overscroll-contain rounded-t-2xl border-t border-border bg-popover px-3 pb-5 shadow-xl animate-in slide-in-from-bottom-4 duration-200 md:hidden print:hidden"
		style:bottom={ABOVE_BAR}
		style:max-height={MAX_HEIGHT}
	>
		<!-- pb-5 keeps the last row clear of the quick-add button, which rises
		     about 12px above the bar into the sheet. -->
		<button
			type="button"
			onclick={dismiss}
			aria-label={t(locale, 'aria.closeMoreSections')}
			class="flex h-11 w-full items-center justify-center"
		>
			<span class="h-1 w-9 rounded-full bg-border" aria-hidden="true"></span>
		</button>
		{#each groups as { group, sections } (group)}
			<div role="group" aria-labelledby="{headingId}-{group}">
				<h2
					id="{headingId}-{group}"
					class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
				>
					{t(locale, NAV_GROUP_LABELS[group])}
				</h2>
				{#each sections as section (section.key)}
					{@const active = isSectionActive('owner', section.path, page.url.pathname, companionId)}
					{@const Icon = NAV_ICONS[section.key]}
					<a
						href={sectionHref('owner', companionId, section.path)}
						aria-current={active ? 'page' : undefined}
						onclick={() => (open = false)}
						class="flex min-h-11 items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium text-foreground transition-colors {active
							? 'bg-primary/10'
							: 'hover:bg-accent'}"
					>
						<Icon
							class="h-5 w-5 shrink-0 {active ? 'text-primary' : 'text-muted-foreground'}"
							aria-hidden="true"
						/>
						<span>{t(locale, section.labelKey)}</span>
					</a>
				{/each}
			</div>
		{/each}
	</div>
{/if}
