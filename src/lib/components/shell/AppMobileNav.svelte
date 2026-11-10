<script lang="ts">
	import type { Component } from 'svelte';
	import { page } from '$app/state';
	import CompanionSwitcher from './CompanionSwitcher.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import PawLogo from '#lib/components/PawLogo.svelte';
	import {
		House,
		NotebookPen,
		HeartPulse,
		Bell,
		Search,
		LayoutGrid,
		UserRound,
		Activity,
		BookOpen,
		Weight,
		FileText,
		StickyNote,
		Pill,
		Package
	} from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { currentFabSection, orderFabActions } from '#lib/nav/fabSections.js';
	import type { CareStatus } from '#lib/careStatus.js';
	import AccountSheet from './AccountSheet.svelte';
	import BottomBar from './BottomBar.svelte';
	import BottomTab from './BottomTab.svelte';
	import QuickAdd from './QuickAdd.svelte';

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

	let isCompanionContext = $derived(activeCompanion !== null);

	let accountOpen = $state(false);

	// Close the sheet on any navigation (e.g. browser back) so it never
	// lingers over a page it wasn't opened on.
	$effect(() => {
		void page.url.pathname;
		accountOpen = false;
	});

	// Companion context nav tabs (4 + central FAB)
	let companionTabs = $derived(
		activeCompanion
			? [
					{ href: `/${activeCompanion.id}`, label: t(locale, 'nav.dashboard'), icon: House },
					{
						href: `/${activeCompanion.id}/journal`,
						label: t(locale, 'nav.journal'),
						icon: NotebookPen
					},
					// FAB placeholder sits in the center — these two are the left tabs
					{
						href: `/${activeCompanion.id}/health`,
						label: t(locale, 'nav.health'),
						icon: HeartPulse
					},
					{
						href: `/${activeCompanion.id}/reminders`,
						label: t(locale, 'nav.reminders'),
						icon: Bell
					}
				]
			: []
	);

	// Overview context tabs (3 equal tabs, no FAB)
	let overviewTabs = $derived([
		{ href: '/', label: t(locale, 'nav.overview'), icon: LayoutGrid, key: 'overview' },
		{
			href: '#search',
			label: t(locale, 'nav.search'),
			icon: Search,
			key: 'search',
			action: () => onOpenSearch()
		},
		{
			href: '#you',
			label: t(locale, 'nav.you'),
			icon: UserRound,
			key: 'you',
			action: () => (accountOpen = true)
		}
	]);

	// FAB menu state
	let fabOpen = $state(false);

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

	function isTabActive(href: string): boolean {
		if (href === `/${activeCompanion?.id}`) return page.url.pathname === href;
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}

	// Companion sections with no bottom tab get an icon in the top bar.
	function headerLinks(companionId: string) {
		return [
			{ href: `/${companionId}/medications`, label: t(locale, 'nav.medications'), icon: Pill },
			{ href: `/${companionId}/supplies`, label: t(locale, 'nav.supplies'), icon: Package },
			{ href: `/${companionId}/documents`, label: t(locale, 'nav.documents'), icon: FileText },
			{ href: `/${companionId}/notes`, label: t(locale, 'nav.notes'), icon: StickyNote }
		];
	}
</script>

<!-- Top bar -->
<header
	class="sticky z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 print:hidden {className}"
	style="top: var(--demo-bar-h, 0px)"
>
	<div class="flex h-14 items-center gap-3 px-4">
		{#if isCompanionContext && activeCompanion}
			<div class="flex-1 min-w-0">
				<CompanionSwitcher {companions} {activeCompanion} {companionStatus} includeOverview />
			</div>
		{:else if companions.length > 0}
			<!-- Overview: companion dropdown with "Overview" selected -->
			<div class="flex-1 min-w-0">
				<CompanionSwitcher {companions} activeCompanion={null} {companionStatus} includeOverview />
			</div>
		{:else}
			<!-- No companions yet: brand greeting -->
			<div class="flex items-center gap-2.5 flex-1 min-w-0">
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

		<!-- Right: companion sections without a tab (companion context) + search -->
		{#if isCompanionContext && activeCompanion}
			{#each headerLinks(activeCompanion.id) as link (link.href)}
				<a
					href={link.href}
					aria-label={link.label}
					aria-current={isTabActive(link.href) ? 'page' : undefined}
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {isTabActive(
						link.href
					)
						? 'text-primary'
						: ''}"
				>
					<link.icon class="h-5 w-5" />
				</a>
			{/each}
		{/if}
		<button
			type="button"
			onclick={onOpenSearch}
			aria-label={t(locale, 'aria.openSearch')}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<Search class="h-5 w-5" />
		</button>
		{#if isCompanionContext && user}
			<button
				type="button"
				onclick={() => (accountOpen = true)}
				aria-label={t(locale, 'aria.openAccountMenu')}
				aria-haspopup="dialog"
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-accent"
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

<!-- Bottom tab bar -->
<BottomBar label={t(locale, 'aria.mainNav')}>
	{#if isCompanionContext}
		{#each companionTabs.slice(0, 2) as tab (tab.href)}
			<BottomTab href={tab.href} label={tab.label} icon={tab.icon} active={isTabActive(tab.href)} />
		{/each}

		<QuickAdd actions={fabActions} icons={FAB_ICONS} bind:open={fabOpen} />

		{#each companionTabs.slice(2, 4) as tab (tab.href)}
			<BottomTab href={tab.href} label={tab.label} icon={tab.icon} active={isTabActive(tab.href)} />
		{/each}
	{:else}
		<!-- Overview context: 3 equal tabs, no FAB -->
		{#each overviewTabs as tab (tab.key)}
			{#if tab.key === 'overview'}
				<BottomTab
					href={tab.href}
					label={tab.label}
					icon={tab.icon}
					active={isTabActive(tab.href)}
				/>
			{:else}
				<BottomTab label={tab.label} icon={tab.icon} onclick={() => tab.action?.()} />
			{/if}
		{/each}
	{/if}
</BottomBar>

{#if user}
	<AccountSheet {user} open={accountOpen} onclose={() => (accountOpen = false)} variant="sheet" />
{/if}
