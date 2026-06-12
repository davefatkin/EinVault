<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';
	import {
		House,
		NotebookPen,
		HeartPulse,
		Bell,
		FileText,
		Settings,
		LogOut,
		ShieldCheck,
		Search,
		ChevronDown,
		LayoutGrid,
		UserRound,
		PlusCircle,
		PawPrint
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
	};

	interface Props {
		companions: Companion[];
		activeCompanion: Companion | null;
		user: User | null;
		companionStatus: Record<string, CareStatus>;
		/** Called when the user activates the search button */
		onOpenSearch: () => void;
	}

	let { companions, activeCompanion, user, companionStatus, onOpenSearch }: Props = $props();

	function statusDotClass(id: string): string {
		const s = companionStatus[id] ?? 'up-to-date';
		if (s === 'needs-attention') return 'bg-coral';
		if (s === 'due-today') return 'bg-gold';
		return 'bg-teal';
	}

	function statusTitle(id: string): string {
		const s = companionStatus[id] ?? 'up-to-date';
		if (s === 'needs-attention') return t(locale, 'overview.careStatus.needsAttention');
		if (s === 'due-today') return t(locale, 'overview.careStatus.dueToday');
		return t(locale, 'overview.careStatus.upToDate');
	}

	const locale = getLocale();

	const OVERVIEW_VALUE = '__overview__';

	let isOverview = $derived(
		activeCompanion === null && page.url.pathname === '/' && companions.length > 1
	);

	let navItems = $derived(
		activeCompanion
			? [
					{ href: `/${activeCompanion.id}`, label: t(locale, 'nav.dashboard'), icon: House },
					{
						href: `/${activeCompanion.id}/journal`,
						label: t(locale, 'nav.journal'),
						icon: NotebookPen
					},
					{
						href: `/${activeCompanion.id}/health`,
						label: t(locale, 'nav.health'),
						icon: HeartPulse
					},
					{
						href: `/${activeCompanion.id}/reminders`,
						label: t(locale, 'nav.reminders'),
						icon: Bell
					},
					{
						href: `/${activeCompanion.id}/documents`,
						label: t(locale, 'nav.documents'),
						icon: FileText
					}
				]
			: []
	);

	let switcherOpen = $state(false);

	function switchCompanion(id: string) {
		switcherOpen = false;
		if (id === OVERVIEW_VALUE) {
			goto('/');
			return;
		}
		const parts = page.url.pathname.split('/');
		if (parts[1] === activeCompanion?.id) {
			const section = parts.slice(2).join('/');
			goto(`/${id}${section ? `/${section}` : ''}`);
		} else {
			goto(`/${id}`);
		}
	}

	function handleSwitcherKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			switcherOpen = false;
		}
	}
</script>

<aside
	class="flex flex-col h-full w-60 shrink-0 border-r border-border bg-card"
	aria-label={t(locale, 'aria.mainNav')}
>
	<!-- Brand -->
	<div class="flex items-center gap-2.5 px-4 py-5 shrink-0">
		<div
			class="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center"
			style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))"
			aria-hidden="true"
		>
			<PawLogo class="w-4 h-4 text-white" />
		</div>
		<span class="font-display font-bold text-base text-foreground">EinVault</span>
	</div>

	<!-- Context control -->
	<div class="px-3 shrink-0">
		{#if activeCompanion}
			<!-- Companion switcher (only shown when more than one companion exists) -->
			{#if companions.length > 1}
				<div class="relative" role="none">
					<button
						type="button"
						onclick={() => (switcherOpen = !switcherOpen)}
						onkeydown={handleSwitcherKeydown}
						aria-label={t(locale, 'layout.switchCompanion')}
						aria-expanded={switcherOpen}
						aria-haspopup="listbox"
						class="flex w-full items-center gap-2.5 rounded-xl border border-border bg-muted px-3 py-2 text-left transition-colors hover:bg-accent mb-2"
					>
						<CompanionAvatar
							companionId={activeCompanion.id}
							avatarPath={activeCompanion.avatarPath}
							name={activeCompanion.name}
							size="sm"
						/>
						<span class="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
							{activeCompanion.name}
						</span>
						<ChevronDown
							class="h-4 w-4 shrink-0 text-muted-foreground transition-transform {switcherOpen
								? 'rotate-180'
								: ''}"
						/>
					</button>

					{#if switcherOpen}
						<button
							type="button"
							class="fixed inset-0 z-40 cursor-default"
							onclick={() => (switcherOpen = false)}
							aria-label="Close companion switcher"
							tabindex="-1"
						></button>
						<ul
							role="listbox"
							aria-label={t(locale, 'layout.switchCompanion')}
							class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
						>
							<li role="option" aria-selected={isOverview}>
								<button
									type="button"
									onclick={() => switchCompanion(OVERVIEW_VALUE)}
									class="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {isOverview
										? 'bg-accent text-foreground'
										: ''}"
								>
									<LayoutGrid class="h-4 w-4 shrink-0" />
									{t(locale, 'nav.overview')}
								</button>
							</li>
							{#each companions as c (c.id)}
								<li role="option" aria-selected={c.id === activeCompanion?.id}>
									<button
										type="button"
										onclick={() => switchCompanion(c.id)}
										class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground {c.id ===
										activeCompanion?.id
											? 'bg-accent text-foreground font-medium'
											: 'text-muted-foreground'}"
									>
										<CompanionAvatar
											companionId={c.id}
											avatarPath={c.avatarPath}
											name={c.name}
											size="sm"
										/>
										<span class="truncate">{c.name}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{:else}
				<!-- Single companion — just show the name, no switcher -->
				<div class="flex items-center gap-2.5 px-3 py-2 mb-2">
					<CompanionAvatar
						companionId={activeCompanion.id}
						avatarPath={activeCompanion.avatarPath}
						name={activeCompanion.name}
						size="sm"
					/>
					<span class="flex-1 min-w-0 truncate text-sm font-semibold text-foreground">
						{activeCompanion.name}
					</span>
				</div>
			{/if}
		{:else if companions.length > 0}
			<!-- Overview mode: companion list -->
			<div class="mb-1">
				<a
					href="/"
					aria-current={isOverview ? 'page' : undefined}
					class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-1 {isOverview
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
					style={isOverview
						? 'background: linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.08));'
						: ''}
				>
					<LayoutGrid
						class="h-4 w-4 shrink-0 {isOverview ? 'text-primary' : 'text-muted-foreground'}"
					/>
					{t(locale, 'nav.overview')}
				</a>

				<p
					class="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
				>
					Companions
				</p>

				{#each companions as c (c.id)}
					<a
						href="/{c.id}"
						aria-current={page.params.companionId === c.id ? 'page' : undefined}
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors {page
							.params.companionId === c.id
							? 'text-foreground font-medium bg-accent'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
					>
						<CompanionAvatar companionId={c.id} avatarPath={c.avatarPath} name={c.name} size="sm" />
						<span class="flex-1 min-w-0 truncate">{c.name}</span>
						<span
							class="h-2 w-2 rounded-full shrink-0 {statusDotClass(c.id)}"
							aria-hidden="true"
							title={statusTitle(c.id)}
						></span>
					</a>
				{/each}

				<a
					href="/companions/new"
					class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
				>
					<PlusCircle class="h-4 w-4 shrink-0" />
					{t(locale, 'layout.addCompanion')}
				</a>
			</div>
		{:else}
			<!-- No companions yet -->
			<a
				href="/companions/new"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent mb-2"
			>
				<PlusCircle class="h-4 w-4 shrink-0" />
				{t(locale, 'layout.addFirstCompanion')}
			</a>
		{/if}
	</div>

	<!-- Section nav (companion context only) -->
	{#if navItems.length > 0}
		<nav class="flex-1 overflow-y-auto px-3 py-1">
			{#each navItems as item (item.href)}
				{@const isActive =
					page.url.pathname === item.href ||
					(page.url.pathname.startsWith(item.href + '/') &&
						item.href !== `/${activeCompanion?.id}`)}
				{@const NavIcon = item.icon}
				<a
					href={item.href}
					aria-current={isActive ? 'page' : undefined}
					class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors mb-0.5 {isActive
						? 'text-foreground'
						: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
					style={isActive
						? 'background: linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.08));'
						: ''}
				>
					<NavIcon class="h-4 w-4 shrink-0 {isActive ? 'text-primary' : 'text-muted-foreground'}" />
					{item.label}
				</a>
			{/each}
		</nav>
	{:else}
		<div class="flex-1"></div>
	{/if}

	<!-- Footer -->
	<div class="mt-auto shrink-0 border-t border-border px-3 py-3 flex flex-col gap-1">
		<!-- Search -->
		<button
			type="button"
			onclick={onOpenSearch}
			aria-label={t(locale, 'aria.openSearch')}
			class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
		>
			<Search class="h-4 w-4 shrink-0" />
			<span class="flex-1 text-left">{t(locale, 'aria.openSearch')}</span>
			<kbd
				class="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground"
				aria-hidden="true"
			>
				⌘K
			</kbd>
		</button>

		<!-- Admin: Users link -->
		{#if user?.role === 'admin'}
			<a
				href="/admin/users"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent {page.url.pathname.startsWith(
					'/admin/users'
				)
					? 'bg-accent text-foreground'
					: ''}"
				aria-current={page.url.pathname.startsWith('/admin/users') ? 'page' : undefined}
			>
				<ShieldCheck class="h-4 w-4 shrink-0" />
				{t(locale, 'nav.admin')}
			</a>
			<a
				href="/admin/companions"
				class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent {page.url.pathname.startsWith(
					'/admin/companions'
				)
					? 'bg-accent text-foreground'
					: ''}"
				aria-current={page.url.pathname.startsWith('/admin/companions') ? 'page' : undefined}
			>
				<PawPrint class="h-4 w-4 shrink-0" />
				{t(locale, 'nav.adminCompanions')}
			</a>
		{/if}

		<!-- Settings -->
		<a
			href="/settings"
			class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:bg-accent {page.url.pathname.startsWith(
				'/settings'
			)
				? 'bg-accent text-foreground'
				: ''}"
			aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
		>
			<Settings class="h-4 w-4 shrink-0" />
			{t(locale, 'nav.settings')}
		</a>

		<!-- Account area -->
		<div class="flex items-center gap-2.5 rounded-lg px-3 py-2">
			{#if user}
				<div
					class="h-7 w-7 rounded-full shrink-0 flex items-center justify-center"
					style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.5))"
					aria-hidden="true"
				>
					<UserRound class="h-4 w-4 text-white" />
				</div>
				<div class="flex-1 min-w-0">
					<p class="text-xs font-medium text-foreground truncate">{user.displayName}</p>
					<p class="text-[10px] text-muted-foreground capitalize">{user.role}</p>
				</div>
			{/if}
			<form method="POST" action="/auth/logout" class="shrink-0">
				<button
					type="submit"
					aria-label={t(locale, 'nav.signOut')}
					title={t(locale, 'nav.signOut')}
					class="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground hover:bg-accent"
				>
					<LogOut class="h-3.5 w-3.5" />
				</button>
			</form>
		</div>
	</div>
</aside>
