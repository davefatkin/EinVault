<script lang="ts">
	import { page } from '$app/state';
	import CompanionSwitcher from './CompanionSwitcher.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';
	import {
		House,
		NotebookPen,
		HeartPulse,
		Bell,
		Search,
		LayoutGrid,
		Users,
		UserRound,
		Plus,
		Activity,
		BookOpen,
		Weight,
		FileText
	} from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import type { CareStatus } from '$lib/careStatus';

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

	// Overview context tabs (4 + no FAB; we insert FAB at position 2)
	let overviewTabs = $derived([
		{ href: '/', label: t(locale, 'nav.overview'), icon: LayoutGrid, key: 'overview' },
		{
			href: '#search',
			label: 'Search',
			icon: Search,
			key: 'search',
			action: () => onOpenSearch()
		},
		...(user?.role === 'admin'
			? [{ href: '/admin/users', label: 'Members', icon: Users, key: 'members' }]
			: []),
		{ href: '/settings', label: 'You', icon: UserRound, key: 'you' }
	]);

	// FAB menu state
	let fabOpen = $state(false);

	let fabActions = $derived(
		activeCompanion
			? [
					{
						href: `/${activeCompanion.id}/journal/${today}`,
						label: 'Add journal entry',
						icon: BookOpen
					},
					{
						href: `/${activeCompanion.id}/health?new=1`,
						label: 'Log health event',
						icon: Activity
					},
					{ href: `/${activeCompanion.id}/reminders?new=1`, label: 'Add reminder', icon: Bell },
					{ href: `/${activeCompanion.id}/health?new=weight`, label: 'Record weight', icon: Weight }
				]
			: []
	);

	function handleFabKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') fabOpen = false;
	}

	function isTabActive(href: string): boolean {
		if (href === `/${activeCompanion?.id}`) return page.url.pathname === href;
		if (href === '/') return page.url.pathname === '/';
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
	}
</script>

<!-- Top bar -->
<header
	class="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 {className}"
>
	<div class="flex h-14 items-center gap-3 px-4">
		{#if isCompanionContext && activeCompanion}
			<div class="flex-1 min-w-0">
				<CompanionSwitcher {companions} {activeCompanion} {companionStatus} includeOverview />
			</div>
		{:else}
			<!-- Overview / no companion: brand greeting -->
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

		<!-- Right: documents (companion context) + search -->
		{#if isCompanionContext && activeCompanion}
			<a
				href={`/${activeCompanion.id}/documents`}
				aria-label={t(locale, 'nav.documents')}
				aria-current={isTabActive(`/${activeCompanion.id}/documents`) ? 'page' : undefined}
				class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {isTabActive(
					`/${activeCompanion.id}/documents`
				)
					? 'text-primary'
					: ''}"
			>
				<FileText class="h-5 w-5" />
			</a>
		{/if}
		<button
			type="button"
			onclick={onOpenSearch}
			aria-label={t(locale, 'aria.openSearch')}
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
		>
			<Search class="h-5 w-5" />
		</button>
	</div>
</header>

<!-- Bottom tab bar -->
<nav
	aria-label={t(locale, 'aria.mainNav')}
	class="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card pb-safe md:hidden"
>
	<div class="relative flex items-end">
		{#if isCompanionContext}
			<!-- Left 2 tabs -->
			{#each companionTabs.slice(0, 2) as tab (tab.href)}
				{@const active = isTabActive(tab.href)}
				{@const TabIcon = tab.icon}
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[56px] justify-end pb-2 {active
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<TabIcon class="h-5 w-5 mb-0.5" />
					{tab.label}
				</a>
			{/each}

			<!-- Central FAB slot -->
			<div class="flex flex-col items-center flex-1 relative" style="padding-bottom: 8px;">
				<!-- FAB menu -->
				{#if fabOpen}
					<button
						type="button"
						class="fixed inset-0 z-40 cursor-default"
						onclick={() => (fabOpen = false)}
						aria-label="Close quick add menu"
						tabindex="-1"
					></button>
					<div
						class="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden min-w-[200px]"
					>
						{#each fabActions as action (action.label)}
							{@const ActionIcon = action.icon}
							<a
								href={action.href}
								onclick={() => (fabOpen = false)}
								class="flex items-center gap-3 px-4 py-3 text-sm text-foreground transition-colors hover:bg-accent"
							>
								<ActionIcon class="h-4 w-4 shrink-0 text-muted-foreground" />
								{action.label}
							</a>
						{/each}
					</div>
				{/if}

				<!-- FAB button -->
				<button
					type="button"
					onclick={() => (fabOpen = !fabOpen)}
					onkeydown={handleFabKeydown}
					aria-label="Quick add"
					aria-expanded={fabOpen}
					class="relative -top-3 h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
					style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7)); box-shadow: 0 8px 20px hsl(var(--primary) / 0.4);"
				>
					<Plus class="h-6 w-6 transition-transform {fabOpen ? 'rotate-45' : ''}" />
				</button>
			</div>

			<!-- Right 2 tabs -->
			{#each companionTabs.slice(2, 4) as tab (tab.href)}
				{@const active = isTabActive(tab.href)}
				{@const TabIcon = tab.icon}
				<a
					href={tab.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[56px] justify-end pb-2 {active
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<TabIcon class="h-5 w-5 mb-0.5" />
					{tab.label}
				</a>
			{/each}
		{:else}
			<!-- Overview context: 4 equal tabs, no FAB -->
			{#each overviewTabs as tab (tab.key)}
				{@const isSearch = tab.key === 'search'}
				{@const active = !isSearch && isTabActive(tab.href)}
				{@const TabIcon = tab.icon}
				{#if isSearch}
					<button
						type="button"
						onclick={onOpenSearch}
						aria-label={t(locale, 'aria.openSearch')}
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground transition-colors min-h-[56px] justify-end pb-2 hover:text-foreground"
					>
						<TabIcon class="h-5 w-5 mb-0.5" />
						Search
					</button>
				{:else}
					<a
						href={tab.href}
						aria-current={active ? 'page' : undefined}
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[56px] justify-end pb-2 {active
							? 'text-primary'
							: 'text-muted-foreground'}"
					>
						<TabIcon class="h-5 w-5 mb-0.5" />
						{tab.label}
					</a>
				{/if}
			{/each}
		{/if}
	</div>
</nav>
