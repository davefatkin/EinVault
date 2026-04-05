<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import {
		House,
		NotebookPen,
		HeartPulse,
		Bell,
		Settings,
		LogOut,
		ShieldCheck
	} from '@lucide/svelte';
	import { THEME_ICONS, THEMES, applyTheme, saveTheme, type Theme } from '$lib/theme';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const locale = getLocale();

	let activeCompanionId = $derived(page.params.companionId ?? null);
	let activeCompanion = $derived(
		data.companions.find((c) => c.id === activeCompanionId) ??
			data.archivedCompanions?.find((c) => c.id === activeCompanionId) ??
			data.companions[0] ??
			null
	);
	let isViewingArchived = $derived(activeCompanion != null && !activeCompanion.isActive);

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
					}
				]
			: []
	);

	function switchCompanion(id: string) {
		const parts = page.url.pathname.split('/');
		// Only carry the section forward on standard companion sub-routes: /{companionId}/{section}
		// Other routes (e.g. /companions/{id}/edit, /settings) go to the companion dashboard
		if (parts[1] === activeCompanionId) {
			const section = parts.slice(2).join('/');
			goto(`/${id}${section ? `/${section}` : ''}`);
		} else {
			goto(`/${id}`);
		}
	}

	// Theme toggle
	let themeOverride = $state<Theme | null>(null);
	let currentTheme = $derived<Theme>(themeOverride ?? (data.user?.theme as Theme) ?? 'system');

	async function setTheme(theme: Theme) {
		themeOverride = theme;
		applyTheme(theme);
		await saveTheme(theme);
	}
</script>

<div class="min-h-screen flex flex-col bg-background">
	<header
		class="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60"
	>
		<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
			<div class="flex h-16 items-center justify-between gap-4">
				<!-- Logo -->
				<a
					href={activeCompanion ? `/${activeCompanion.id}` : '/'}
					class="logo-link flex items-center gap-2 shrink-0"
				>
					<PawLogo
						class="logo-paw w-7 h-7 shrink-0 text-muted-foreground transition-[color,transform] duration-200"
					/>
					<span class="font-display font-bold text-lg hidden sm:block text-primary">EinVault</span>
				</a>

				<!-- Companion switcher -->
				<div class="flex items-center gap-2 flex-1 min-w-0 justify-start">
					{#if isViewingArchived && activeCompanion}
						<CompanionAvatar
							companionId={activeCompanion.id}
							avatarPath={activeCompanion.avatarPath}
							name={activeCompanion.name}
							size="sm"
							archived={true}
						/>
						<span class="text-sm italic text-muted-foreground truncate">
							{activeCompanion.name} <span class="text-xs">{t(locale, 'layout.archived')}</span>
						</span>
						<Button href="/settings" variant="ghost" size="sm" class="shrink-0 text-xs">
							{t(locale, 'common.back')}
						</Button>
					{:else if data.companions.length > 0}
						{#if activeCompanion}
							<CompanionAvatar
								companionId={activeCompanion.id}
								avatarPath={activeCompanion.avatarPath}
								name={activeCompanion.name}
								size="sm"
							/>
						{/if}
						{#if data.companions.length === 1}
							<span class="font-medium text-sm truncate text-foreground"
								>{activeCompanion?.name}</span
							>
						{:else}
							<Select
								class="max-w-[160px]"
								aria-label={t(locale, 'layout.switchCompanion')}
								value={activeCompanionId ?? activeCompanion?.id}
								onchange={(e) => switchCompanion(e.currentTarget.value)}
							>
								{#each data.companions as c (c.id)}
									<option value={c.id}>{c.name}</option>
								{/each}
							</Select>
						{/if}
					{:else}
						<Button href="/companions/new" size="sm">
							{data.archivedCompanions?.length
								? t(locale, 'layout.addCompanion')
								: t(locale, 'layout.addFirstCompanion')}
						</Button>
					{/if}
				</div>

				<!-- Right: theme toggle + user menu -->
				<div class="flex items-center gap-1 shrink-0">
					<!-- Theme toggle -->
					<div class="flex rounded-md border border-border p-0.5 gap-0.5 bg-muted">
						{#each THEMES as theme (theme)}
							{@const Icon = THEME_ICONS[theme]}
							<button
								type="button"
								onclick={() => setTheme(theme)}
								title="{theme.charAt(0).toUpperCase() + theme.slice(1)} mode"
								aria-label="{theme.charAt(0).toUpperCase() + theme.slice(1)} mode"
								aria-pressed={currentTheme === theme}
								class="rounded px-2 py-1 transition-all {currentTheme === theme
									? 'bg-background text-foreground shadow-sm'
									: 'text-muted-foreground hover:text-foreground'}"
							>
								<Icon class="h-3.5 w-3.5" />
							</button>
						{/each}
					</div>

					{#if data.user?.role === 'admin'}
						<Button href="/admin/users" variant="ghost" size="sm" class="gap-1.5">
							<ShieldCheck class="h-3.5 w-3.5" />
							<span class="hidden sm:inline">{t(locale, 'nav.admin')}</span>
						</Button>
					{/if}
					<Button href="/settings" variant="ghost" size="sm" class="hidden md:inline-flex gap-1.5">
						<Settings class="h-4 w-4" />
						<span class="hidden sm:inline">{t(locale, 'nav.settings')}</span>
					</Button>
					<form method="POST" action="/auth/logout">
						<Button type="submit" variant="ghost" size="sm" class="gap-1.5">
							<LogOut class="h-4 w-4" />
							<span class="hidden sm:inline">{t(locale, 'nav.signOut')}</span>
						</Button>
					</form>
				</div>
			</div>
		</div>
	</header>

	<div class="flex flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6 gap-6">
		<!-- Sidebar nav (desktop) -->
		{#if navItems.length > 0}
			<nav
				aria-label={t(locale, 'aria.mainNav')}
				class="hidden md:flex flex-col gap-1 w-48 shrink-0"
			>
				{#each navItems as item (item.href)}
					{@const isActive =
						page.url.pathname === item.href ||
						(page.url.pathname.startsWith(item.href + '/') &&
							item.href !== `/${activeCompanion?.id}`)}
					{@const NavIcon = item.icon}
					<a
						href={item.href}
						aria-current={isActive ? 'page' : undefined}
						class="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors {isActive
							? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary pl-[10px]'
							: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
					>
						<NavIcon class="h-4 w-4 shrink-0" />
						{item.label}
					</a>
				{/each}
			</nav>
		{/if}

		<main class="flex-1 min-w-0 animate-fade-in pb-20 md:pb-0">
			{@render children()}
		</main>
	</div>

	<AppFooter version={data.version} year={data.year} />

	<!-- Mobile bottom nav -->
	{#if navItems.length > 0}
		<nav
			aria-label={t(locale, 'aria.mainNav')}
			class="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card pb-safe"
		>
			<div class="flex">
				{#each navItems as item (item.href)}
					{@const isActive =
						page.url.pathname === item.href ||
						(page.url.pathname.startsWith(item.href + '/') &&
							item.href !== `/${activeCompanion?.id}`)}
					{@const NavIcon = item.icon}
					<a
						href={item.href}
						aria-current={isActive ? 'page' : undefined}
						class="flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors {isActive
							? 'text-primary'
							: 'text-muted-foreground'}"
					>
						<NavIcon class="h-5 w-5" />
						{item.label}
					</a>
				{/each}
				<a
					href="/settings"
					aria-current={page.url.pathname.startsWith('/settings') ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium transition-colors {page.url.pathname.startsWith(
						'/settings'
					)
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<Settings class="h-5 w-5" />
					{t(locale, 'nav.settings')}
				</a>
			</div>
		</nav>
	{/if}
</div>

<style>
	.logo-link:hover :global(.logo-paw) {
		color: hsl(var(--primary));
		transform: scale(1.1) rotate(-12deg);
	}
</style>
