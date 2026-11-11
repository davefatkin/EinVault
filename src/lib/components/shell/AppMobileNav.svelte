<script lang="ts">
	import type { Component } from 'svelte';
	import { untrack, tick } from 'svelte';
	import { page } from '$app/state';
	import CompanionSwitcher from './CompanionSwitcher.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import PawLogo from '#lib/components/PawLogo.svelte';
	import { Bell, Search, Activity, BookOpen, Weight } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { currentFabSection, orderFabActions } from '#lib/nav/fabSections.js';
	import { OWNER_SECTIONS, isSectionActive, sectionHref } from '#lib/nav/sections.js';
	import { NAV_ICONS } from '#lib/nav/icons.js';
	import type { CareStatus } from '#lib/careStatus.js';
	import AccountSheet from './AccountSheet.svelte';
	import BottomBar from './BottomBar.svelte';
	import BottomTab from './BottomTab.svelte';
	import QuickAdd from './QuickAdd.svelte';
	import MoreSheet from './MoreSheet.svelte';

	type Companion = {
		id: string;
		name: string;
		avatarPath?: string | null;
		isActive?: boolean;
	};

	type User = {
		id: string;
		displayName: string;
		role: 'admin' | 'member' | 'caretaker';
		theme: 'light' | 'dark' | 'system';
		avatarPath?: string | null;
	};

	interface Props {
		companions: Companion[];
		activeCompanion: Companion | null;
		user: User | null;
		today: string;
		companionStatus: Record<string, CareStatus>;
		onOpenSearch: () => void;
		class?: string;
	}

	let {
		companions,
		activeCompanion,
		user,
		today,
		companionStatus,
		onOpenSearch,
		class: className = ''
	}: Props = $props();

	const locale = getLocale();
	const moreTabId = $props.id();

	// One open panel at a time: opening any of them closes the others.
	type Panel = 'more' | 'quickAdd' | 'switcher' | 'account';
	let openPanel = $state<Panel | null>(null);

	// Children write `open` from their own effects (e.g. close on navigation).
	// Reading openPanel here must not become a dependency of those effects, or
	// opening a panel would rerun them and close it again.
	function setPanel(panel: Panel, isOpen: boolean) {
		untrack(() => {
			if (isOpen) openPanel = panel;
			else if (openPanel === panel) openPanel = null;
		});
	}

	// Close the account sheet on any navigation (e.g. browser back) so it never
	// lingers over a page it wasn't opened on. The other panels close themselves.
	$effect(() => {
		void page.url.pathname;
		setPanel('account', false);
	});

	// Bottom bar: Home, Journal, quick add, Reminders, More.
	let tabs = $derived(
		activeCompanion
			? OWNER_SECTIONS.filter((s) => s.mobile === 'tab').map((s) => ({
					key: s.key,
					href: sectionHref('owner', activeCompanion.id, s.path),
					label: t(locale, s.tabLabelKey ?? s.labelKey),
					icon: NAV_ICONS[s.key],
					active: isSectionActive('owner', s.path, page.url.pathname, activeCompanion.id)
				}))
			: []
	);

	let moreActive = $derived(
		!!activeCompanion &&
			OWNER_SECTIONS.some(
				(s) =>
					s.mobile === 'more' &&
					isSectionActive('owner', s.path, page.url.pathname, activeCompanion.id)
			)
	);

	type FabKey = 'journal' | 'health' | 'reminders' | 'weight';

	const FAB_ICONS: Record<FabKey, Component> = {
		journal: BookOpen,
		health: Activity,
		reminders: Bell,
		weight: Weight
	};

	let fabActions = $derived(
		activeCompanion
			? orderFabActions(
					[
						{
							key: 'journal',
							href: `/${activeCompanion.id}/journal/${today}`,
							label: t(locale, 'nav.fab.addJournal')
						},
						{
							key: 'health',
							href: `/${activeCompanion.id}/health?new=1`,
							label: t(locale, 'nav.fab.logHealth')
						},
						{
							key: 'reminders',
							href: `/${activeCompanion.id}/reminders?new=1`,
							label: t(locale, 'nav.fab.addReminder')
						},
						{
							key: 'weight',
							href: `/${activeCompanion.id}/health?new=weight`,
							label: t(locale, 'nav.fab.recordWeight')
						}
					],
					currentFabSection(page.url.pathname)
				)
			: []
	);

	async function focusMore() {
		await tick();
		document.getElementById(moreTabId)?.focus();
	}
</script>

<!-- Top bar: switcher, search, account. Nothing else, so the pet's name keeps
     its room; sections without a bottom tab live in the More sheet. -->
<header
	class="sticky z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 print:hidden {className}"
	style="top: var(--demo-bar-h, 0px)"
>
	<div class="flex h-14 items-center gap-1 px-2.5">
		{#if companions.length > 0 || activeCompanion}
			<div class="flex-1 min-w-0">
				<CompanionSwitcher
					{companions}
					{activeCompanion}
					{companionStatus}
					includeOverview
					addHref={user?.role === 'caretaker' ? undefined : '/companions/new'}
					bind:open={() => openPanel === 'switcher', (v) => setPanel('switcher', v)}
				/>
			</div>
			<button
				type="button"
				onclick={onOpenSearch}
				aria-label={t(locale, 'aria.openSearch')}
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
			>
				<Search class="h-5 w-5" />
			</button>
		{:else}
			<!-- No companions yet: greeting, no search (nothing to find yet) -->
			<div class="flex items-center gap-2.5 flex-1 min-w-0 px-1.5">
				{#if user}
					<UserAvatar
						userId={user.id}
						displayName={user.displayName}
						avatarPath={user.avatarPath}
						size="sm"
					/>
				{:else}
					<div
						class="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
						style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))"
						aria-hidden="true"
					>
						<PawLogo class="w-4 h-4 text-white" />
					</div>
				{/if}
				<span class="font-display font-bold text-base text-foreground truncate">
					{user
						? t(locale, 'overview.greeting', { name: user.displayName.split(' ')[0] })
						: 'EinVault'}
				</span>
			</div>
		{/if}
		{#if user}
			<button
				type="button"
				onclick={() => setPanel('account', true)}
				aria-label={t(locale, 'aria.openAccountMenu')}
				aria-haspopup="dialog"
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent"
			>
				<UserAvatar
					userId={user.id}
					displayName={user.displayName}
					avatarPath={user.avatarPath}
					size="sm"
				/>
			</button>
		{/if}
	</div>
</header>

<!-- Bottom bar: only while a pet is in view. Household, settings and admin
     pages have none. -->
{#if activeCompanion}
	<BottomBar label={t(locale, 'aria.mainNav')} inert={openPanel === 'more'}>
		{#each tabs.slice(0, 2) as tab (tab.key)}
			<BottomTab href={tab.href} label={tab.label} icon={tab.icon} active={tab.active} shrink />
		{/each}

		<!-- The button needs 48px of its slot; the rest goes to the tab labels
		     (es "Recordatorios" is 73px, a fifth of 360px is 72). -->
		<QuickAdd
			actions={fabActions}
			icons={FAB_ICONS}
			narrow
			bind:open={() => openPanel === 'quickAdd', (v) => setPanel('quickAdd', v)}
		/>

		{#each tabs.slice(2) as tab (tab.key)}
			<BottomTab href={tab.href} label={tab.label} icon={tab.icon} active={tab.active} shrink />
		{/each}

		<BottomTab
			id={moreTabId}
			label={t(locale, 'nav.more')}
			icon={NAV_ICONS.more}
			active={moreActive}
			currentNote={t(locale, 'aria.currentSection')}
			haspopup="dialog"
			expanded={openPanel === 'more'}
			onclick={() => setPanel('more', openPanel !== 'more')}
			shrink
		/>
	</BottomBar>

	<MoreSheet
		companionId={activeCompanion.id}
		bind:open={() => openPanel === 'more', (v) => setPanel('more', v)}
		returnFocus={focusMore}
	/>
{/if}

{#if user}
	<AccountSheet
		{user}
		open={openPanel === 'account'}
		onclose={() => setPanel('account', false)}
		variant="sheet"
	/>
{/if}
