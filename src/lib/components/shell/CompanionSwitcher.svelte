<script lang="ts">
	import { page } from '$app/state';
	import CompanionAvatar from '#lib/components/CompanionAvatar.svelte';
	import { ChevronDown, LayoutGrid } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { CareStatus } from '#lib/careStatus.js';
	import { switchTarget } from '#lib/nav/sections.js';

	type Companion = {
		id: string;
		name: string;
		avatarPath?: string | null;
		isActive?: boolean;
	};

	interface Props {
		companions: Companion[];
		/** Null when no pet is in view (Overview, settings, ...). */
		activeCompanion: Companion | null;
		/** Status dots. Dots render only when this is passed. */
		companionStatus?: Record<string, CareStatus>;
		/** Owner switcher offers an "Overview" entry; caretaker does not. */
		includeOverview?: boolean;
		/** Route prefix: '' for owner (/{id}), '/care' for caretaker (/care/{id}). */
		basePath?: '' | '/care';
		/** 'sidebar' is the bordered desktop look, 'bar' the compact top bar look. */
		variant?: 'bar' | 'sidebar';
		open?: boolean;
	}

	let {
		companions,
		activeCompanion,
		companionStatus,
		includeOverview = false,
		basePath = '',
		variant = 'bar',
		open = $bindable(false)
	}: Props = $props();

	const locale = getLocale();
	const panelId = $props.id();
	let trigger = $state<HTMLButtonElement | null>(null);

	// Archived pets stay reachable as the active pet but are not switch targets.
	let pets = $derived(companions.filter((c) => c.isActive !== false));
	let overviewHref = $derived(basePath || '/');
	let onOverview = $derived(page.url.pathname === overviewHref);
	let petInView = $derived(!!activeCompanion && page.params.companionId === activeCompanion.id);
	let showOverview = $derived(includeOverview && pets.length > 1);
	let activeListed = $derived(!!activeCompanion && pets.some((c) => c.id === activeCompanion.id));
	let needsMenu = $derived(
		activeCompanion ? pets.length > 1 || (!activeListed && pets.length > 0) : pets.length > 1
	);

	function hrefFor(id: string): string {
		return petInView ? switchTarget(page.url.pathname, id) : `${basePath}/${id}`;
	}

	function statusLabel(id: string): string {
		const s = companionStatus?.[id] ?? 'up-to-date';
		const key =
			s === 'needs-attention'
				? 'overview.careStatus.needsAttention'
				: s === 'due-today'
					? 'overview.careStatus.dueToday'
					: 'overview.careStatus.upToDate';
		return t(locale, 'aria.careStatus', { status: t(locale, key) });
	}

	function dotClass(id: string): string {
		const s = companionStatus?.[id] ?? 'up-to-date';
		if (s === 'needs-attention') return 'bg-coral';
		if (s === 'due-today') return 'bg-gold';
		return 'bg-teal';
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || !open) return;
		e.stopPropagation();
		open = false;
		trigger?.focus();
	}

	$effect(() => {
		page.url.pathname; // track: close after every navigation
		open = false;
	});

	let triggerClass = $derived(
		variant === 'sidebar'
			? 'flex w-full items-center gap-2.5 rounded-xl border border-border bg-muted px-3 py-2 text-left transition-colors hover:bg-accent min-w-0'
			: 'flex w-full min-h-11 items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent min-w-0'
	);
	let staticClass = $derived(
		variant === 'sidebar'
			? 'flex items-center gap-2.5 px-3 py-2 min-w-0'
			: 'flex min-h-11 items-center gap-2.5 min-w-0 flex-1'
	);
	let wrapperClass = $derived(variant === 'sidebar' ? 'mb-2' : 'flex-1 min-w-0');
</script>

{#snippet dot(id: string)}
	{#if companionStatus}
		<span class="h-2 w-2 shrink-0 rounded-full {dotClass(id)}" aria-hidden="true"></span>
		<span class="sr-only">{statusLabel(id)}</span>
	{/if}
{/snippet}

{#if needsMenu}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="relative {wrapperClass}" onkeydown={onKeydown}>
		<button
			type="button"
			bind:this={trigger}
			onclick={() => (open = !open)}
			aria-expanded={open}
			aria-controls={panelId}
			class={triggerClass}
		>
			<span class="sr-only">{t(locale, 'layout.switchCompanion')}</span>
			{#if activeCompanion}
				<CompanionAvatar
					companionId={activeCompanion.id}
					avatarPath={activeCompanion.avatarPath}
					name={activeCompanion.name}
					size="sm"
				/>
				<span class="flex-1 min-w-0 font-semibold text-sm text-foreground truncate">
					{activeCompanion.name}
				</span>
				{@render dot(activeCompanion.id)}
			{:else}
				<span
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground"
				>
					<LayoutGrid class="h-4 w-4" />
				</span>
				<span class="flex-1 min-w-0 font-semibold text-sm text-foreground truncate">
					{onOverview ? t(locale, 'nav.overview') : t(locale, 'layout.companionsHeading')}
				</span>
			{/if}
			<ChevronDown
				class="h-4 w-4 shrink-0 text-muted-foreground transition-transform {open
					? 'rotate-180'
					: ''}"
			/>
		</button>

		{#if open}
			<button
				type="button"
				class="fixed inset-0 z-40 cursor-default"
				onclick={() => (open = false)}
				aria-label={t(locale, 'aria.closeSwitcher')}
				tabindex="-1"
			></button>
			<div
				id={panelId}
				role="group"
				aria-label={t(locale, 'layout.switchCompanion')}
				class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
			>
				{#if showOverview}
					<a
						href={overviewHref}
						aria-current={onOverview ? 'page' : undefined}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {onOverview
							? 'bg-accent text-foreground'
							: ''}"
					>
						<LayoutGrid class="h-4 w-4 shrink-0" />
						{t(locale, 'nav.overview')}
					</a>
				{/if}
				{#each pets as c (c.id)}
					{@const current = c.id === activeCompanion?.id}
					<a
						href={hrefFor(c.id)}
						aria-current={current ? 'page' : undefined}
						class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground {current
							? 'bg-accent text-foreground font-medium'
							: 'text-muted-foreground'}"
					>
						<CompanionAvatar companionId={c.id} avatarPath={c.avatarPath} name={c.name} size="sm" />
						<span class="truncate">{c.name}</span>
						<span class="ml-auto flex items-center">{@render dot(c.id)}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{:else if activeCompanion}
	<!-- One pet: static display -->
	<div class={staticClass}>
		<CompanionAvatar
			companionId={activeCompanion.id}
			avatarPath={activeCompanion.avatarPath}
			name={activeCompanion.name}
			size="sm"
		/>
		<span class="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
			{activeCompanion.name}
		</span>
	</div>
{:else if pets.length === 1}
	<!-- One pet and none in view: a plain link instead of a menu -->
	<a href="{basePath}/{pets[0].id}" class="{staticClass} rounded-xl hover:bg-accent">
		<CompanionAvatar
			companionId={pets[0].id}
			avatarPath={pets[0].avatarPath}
			name={pets[0].name}
			size="sm"
		/>
		<span class="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
			{pets[0].name}
		</span>
	</a>
{/if}
