<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Select } from '$lib/components/ui/select/index.js';
	import {
		Home,
		ClipboardList,
		NotebookPen,
		Lock,
		Settings,
		LogOut,
		ChevronRight
	} from '@lucide/svelte';
	import { THEME_ICONS, THEMES, applyTheme, saveTheme, type Theme } from '$lib/theme';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const locale = getLocale();

	let activeCompanionId = $derived($page.params.companionId ?? null);
	let activeCompanion = $derived(
		data.companions.find((c) => c.id === activeCompanionId) ?? data.companions[0] ?? null
	);

	let navItems = $derived(
		activeCompanion
			? [
					{
						href: `/care/${activeCompanion.id}`,
						label: t(locale, 'nav.caretaker.overview'),
						icon: Home,
						restricted: false
					},
					{
						href: `/care/${activeCompanion.id}/log`,
						label: t(locale, 'nav.caretaker.logActivity'),
						icon: ClipboardList,
						restricted: true
					},
					{
						href: `/care/${activeCompanion.id}/journal`,
						label: t(locale, 'nav.journal'),
						icon: NotebookPen,
						restricted: true
					}
				]
			: []
	);

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
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="flex h-16 items-center justify-between gap-4">
				<!-- Logo (linked) -->
				<a
					href="/care/{data.companions?.[0]?.id ?? ''}"
					class="logo-link flex items-center gap-2 shrink-0"
				>
					<PawLogo
						class="logo-paw w-7 h-7 text-muted-foreground transition-[color,transform] duration-200"
					/>
					<span class="font-display font-bold text-lg text-primary">EinVault</span>
					<Badge variant="moss" class="text-xs">{t(locale, 'enum.role.caretaker')}</Badge>
				</a>

				<!-- Companion name (if single) or switcher (if multiple) -->
				{#if data.companions.length > 1}
					<Select
						id="companion-switcher"
						name="companionId"
						aria-label={t(locale, 'layout.switchCompanion')}
						class="max-w-[160px]"
						value={activeCompanionId ?? activeCompanion?.id}
						onchange={(e) => goto(`/care/${e.currentTarget.value}`)}
					>
						{#each data.companions as c (c.id)}
							<option value={c.id}>{c.name}</option>
						{/each}
					</Select>
				{:else if activeCompanion}
					<div class="flex items-center gap-2">
						<CompanionAvatar
							companionId={activeCompanion.id}
							avatarPath={activeCompanion.avatarPath}
							name={activeCompanion.name}
							size="sm"
						/>
						<span class="font-medium text-sm text-muted-foreground">{activeCompanion.name}</span>
					</div>
				{/if}

				<!-- Right: theme toggle + settings + sign out -->
				<div class="flex items-center gap-1 shrink-0">
					<div class="flex rounded-md border border-border p-0.5 gap-0.5 bg-muted">
						{#each THEMES as theme (theme)}
							{@const Icon = THEME_ICONS[theme]}
							<button
								type="button"
								onclick={() => setTheme(theme)}
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
					<Button
						href="/care/settings"
						variant="ghost"
						size="sm"
						class="hidden md:inline-flex gap-1.5"
					>
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

	<!-- Shift status banner -->
	{#if data.isOnShift && data.activeShift}
		<a
			href="/care/settings#shifts"
			class="block border-b bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900 transition-colors"
		>
			<div
				class="mx-auto max-w-3xl px-4 sm:px-6 py-2 flex items-center gap-2 text-sm text-green-700 dark:text-green-300"
			>
				<span class="inline-block w-2 h-2 rounded-full bg-green-500 shrink-0" aria-hidden="true"
				></span>
				<span
					>{t(locale, 'layout.caretaker.onShift')}
					<LocalTime date={data.activeShift.endAt} format="datetime" /></span
				>
				{#if data.activeShift.notes}
					<span class="text-xs opacity-70">· {data.activeShift.notes}</span>
				{/if}
				<ChevronRight class="h-3.5 w-3.5 ml-auto shrink-0 opacity-50" />
			</div>
		</a>
	{:else}
		<a
			href="/care/settings#shifts"
			class="block border-b bg-muted/50 hover:bg-muted/80 transition-colors"
		>
			<div
				class="mx-auto max-w-3xl px-4 sm:px-6 py-2 flex items-center gap-2 text-sm text-muted-foreground"
			>
				<span
					class="inline-block w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0"
					aria-hidden="true"
				></span>
				{#if data.nextShift}
					<span
						>{t(locale, 'layout.caretaker.notOnShift')}
						<LocalTime date={data.nextShift.startAt} format="datetime" />
						{#if data.nextShift.notes}<span class="opacity-70"> · {data.nextShift.notes}</span>{/if}
					</span>
				{:else}
					<span>{t(locale, 'layout.caretaker.noUpcomingShifts')}</span>
				{/if}
				<ChevronRight class="h-3.5 w-3.5 ml-auto shrink-0 opacity-50" />
			</div>
		</a>
	{/if}

	<div class="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 flex-1 pb-20 md:pb-6">
		{#if navItems.length > 0}
			<nav
				class="hidden md:flex gap-1 mb-6 rounded-xl border border-border bg-muted p-1"
				aria-label={t(locale, 'aria.caretakerNav')}
			>
				{#each navItems as item (item.href)}
					{@const isActive =
						$page.url.pathname === item.href ||
						($page.url.pathname.startsWith(item.href + '/') &&
							item.href !== `/care/${activeCompanion?.id}`)}
					{@const isLocked = item.restricted && !data.isOnShift}
					{@const NavIcon = item.icon}
					{#if isLocked}
						<span
							aria-label="{item.label} ({t(locale, 'layout.caretaker.requiresActiveShift')})"
							class="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium opacity-40 cursor-not-allowed text-muted-foreground"
						>
							<NavIcon class="h-4 w-4 shrink-0" />
							{item.label}
							<Lock class="h-3 w-3 ml-0.5" aria-hidden="true" />
						</span>
					{:else}
						<a
							href={item.href}
							aria-current={isActive ? 'page' : undefined}
							class="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors
								{isActive
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
						>
							<NavIcon class="h-4 w-4 shrink-0" />
							{item.label}
						</a>
					{/if}
				{/each}
			</nav>
		{/if}

		<main class="animate-fade-in">
			{@render children()}
		</main>
	</div>

	<AppFooter version={data.version} year={data.year} />

	<!-- Mobile bottom nav -->
	{#if navItems.length > 0}
		<nav class="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card pb-safe z-30">
			<div class="flex">
				{#each navItems as item (item.href)}
					{@const isActive =
						$page.url.pathname === item.href ||
						($page.url.pathname.startsWith(item.href + '/') &&
							item.href !== `/care/${activeCompanion?.id}`)}
					{@const isLocked = item.restricted && !data.isOnShift}
					{@const NavIcon = item.icon}
					{#if isLocked}
						<span
							aria-label="{item.label} ({t(locale, 'layout.caretaker.requiresActiveShift')})"
							class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium opacity-40 cursor-not-allowed text-muted-foreground"
						>
							<NavIcon class="h-5 w-5" />
							{item.label}
						</span>
					{:else}
						<a
							href={item.href}
							aria-current={isActive ? 'page' : undefined}
							class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors
								{isActive ? 'text-primary' : 'text-muted-foreground'}"
						>
							<NavIcon class="h-5 w-5" />
							{item.label}
						</a>
					{/if}
				{/each}
				<a
					href="/care/settings"
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors
						{$page.url.pathname.startsWith('/care/settings') ? 'text-primary' : 'text-muted-foreground'}"
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
