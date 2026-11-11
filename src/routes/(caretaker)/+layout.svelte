<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import PawLogo from '#lib/components/PawLogo.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { ClipboardList, NotebookPen, Lock, Settings, LogOut, ChevronRight } from '@lucide/svelte';
	import AppFooter from '#lib/components/AppFooter.svelte';
	import { ToastRegion } from '#lib/components/ui/toast/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import CompanionSwitcher from '#lib/components/shell/CompanionSwitcher.svelte';
	import { currentFabSection, orderFabActions } from '#lib/nav/fabSections.js';
	import { CARETAKER_SECTIONS, sectionHref, isSectionActive } from '#lib/nav/sections.js';
	import { NAV_ICONS } from '#lib/nav/icons.js';
	import BottomBar from '#lib/components/shell/BottomBar.svelte';
	import BottomTab from '#lib/components/shell/BottomTab.svelte';
	import QuickAdd from '#lib/components/shell/QuickAdd.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const locale = getLocale();

	let activeCompanionId = $derived(page.params.companionId ?? null);
	let activeCompanion = $derived(
		data.companions.find((c) => c.id === activeCompanionId) ?? data.companions[0] ?? null
	);

	// Quick add (on shift only)
	const CARE_FAB_ICONS = { log: ClipboardList, journal: NotebookPen };

	let fabOpen = $state(false);

	let fabActions = $derived(
		activeCompanion && data.isOnShift
			? orderFabActions(
					[
						{
							key: 'log',
							href: sectionHref('caretaker', activeCompanion.id, 'log'),
							label: t(locale, 'nav.caretaker.logActivity')
						},
						{
							key: 'journal',
							href: sectionHref('caretaker', activeCompanion.id, 'journal'),
							label: t(locale, 'nav.caretaker.addJournal')
						}
					],
					currentFabSection(page.url.pathname)
				)
			: []
	);

	let settingsActive = $derived(page.url.pathname.startsWith('/care/settings'));
</script>

<div class="min-h-screen flex flex-col bg-background print:min-h-0">
	<header
		class="sticky z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 print:hidden"
		style="top: var(--demo-bar-h, 0px)"
	>
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="flex h-16 items-center justify-between gap-4">
				<!-- Logo (linked) -->
				<a
					href="/care/{activeCompanion?.id ?? ''}"
					class="group hidden sm:flex items-center gap-2 shrink-0"
				>
					<div
						class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-6"
						style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.6))"
						aria-hidden="true"
					>
						<PawLogo class="h-4 w-4 text-white" />
					</div>
					<span class="font-display font-bold text-lg text-foreground">EinVault</span>
					<Badge variant="teal" class="text-xs">{t(locale, 'enum.role.caretaker')}</Badge>
				</a>

				<!-- Companion switcher -->
				{#if activeCompanion}
					<div class="min-w-0 flex-1 max-w-[220px]">
						<CompanionSwitcher companions={data.companions} {activeCompanion} basePath="/care" />
					</div>
				{/if}

				<!-- Right: user avatar + settings + sign out -->
				<div class="flex items-center gap-1 shrink-0">
					{#if data.user}
						<UserAvatar
							userId={data.user.id}
							displayName={data.user.displayName}
							avatarPath={data.user.avatarPath}
							size="sm"
							class="mr-1"
						/>
					{/if}
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
			class="block border-b border-border bg-teal/10 hover:bg-teal/15 transition-colors print:hidden"
		>
			<div class="mx-auto max-w-3xl px-4 sm:px-6 py-2 flex items-center gap-2 text-sm text-teal">
				<span class="inline-block w-2 h-2 rounded-full bg-teal shrink-0" aria-hidden="true"></span>
				<span
					>{t(locale, 'layout.caretaker.onShift')}
					<LocalTime date={data.activeShift.endAt} format="datetime" /></span
				>
				{#if data.activeShift.notes}<span class="text-xs opacity-70"
						>· {data.activeShift.notes}</span
					>{/if}
				<ChevronRight class="h-3.5 w-3.5 ml-auto shrink-0 opacity-50" />
			</div>
		</a>
	{:else}
		<a
			href="/care/settings#shifts"
			class="block border-b bg-muted/50 hover:bg-muted/80 transition-colors print:hidden"
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

	<div
		class="mx-auto w-full max-w-3xl px-4 sm:px-6 py-6 flex-1 pb-20 md:pb-6 print:max-w-none print:p-0"
	>
		{#if activeCompanion}
			<nav
				class="hidden md:flex gap-1 mb-6 rounded-xl border border-border bg-muted p-1 print:hidden"
				aria-label={t(locale, 'aria.caretakerNav')}
			>
				{#each CARETAKER_SECTIONS as section (section.key)}
					{@const isActive = isSectionActive(
						'caretaker',
						section.path,
						page.url.pathname,
						activeCompanion.id
					)}
					{@const label = t(locale, section.labelKey)}
					{@const NavIcon = NAV_ICONS[section.key]}
					{#if section.restricted && !data.isOnShift}
						<span
							class="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium opacity-40 cursor-not-allowed text-muted-foreground"
						>
							<NavIcon class="h-4 w-4 shrink-0" />
							{label}
							<span class="sr-only">({t(locale, 'layout.caretaker.requiresActiveShift')})</span>
							<Lock class="h-3 w-3 ml-0.5" aria-hidden="true" />
						</span>
					{:else}
						<a
							href={sectionHref('caretaker', activeCompanion.id, section.path)}
							aria-current={isActive ? 'page' : undefined}
							class="flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors
								{isActive
								? 'bg-background text-foreground shadow-sm'
								: 'text-muted-foreground hover:text-foreground hover:bg-accent'}"
						>
							<NavIcon class="h-4 w-4 shrink-0" />
							{label}
						</a>
					{/if}
				{/each}
			</nav>
		{/if}

		<main class="animate-fade-in">
			{@render children()}
		</main>
	</div>

	<AppFooter version={data.version} year={data.year} hasBottomBar={true} />

	<ToastRegion ariaLabel={t(locale, 'common.reminder.toastAriaRegion')} />

	<!-- Mobile bottom nav -->
	<BottomBar label={t(locale, 'aria.caretakerNav')}>
		{#if activeCompanion}
			{#each CARETAKER_SECTIONS as section (section.key)}
				{#if section.key === 'log'}
					{#if data.isOnShift}
						<QuickAdd actions={fabActions} icons={CARE_FAB_ICONS} bind:open={fabOpen} />
					{/if}
				{/if}
				<BottomTab
					href={sectionHref('caretaker', activeCompanion.id, section.path)}
					label={t(locale, section.labelKey)}
					icon={NAV_ICONS[section.key]}
					active={isSectionActive('caretaker', section.path, page.url.pathname, activeCompanion.id)}
					locked={section.restricted && !data.isOnShift}
					lockedNote={t(locale, 'layout.caretaker.requiresActiveShift')}
				/>
			{/each}
		{/if}
		<BottomTab
			href="/care/settings"
			label={t(locale, 'nav.settings')}
			icon={NAV_ICONS.settings}
			active={settingsActive}
		/>
	</BottomBar>
</div>
