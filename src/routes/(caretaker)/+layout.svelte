<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import PawLogo from '$lib/components/PawLogo.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import {
		Home,
		ClipboardList,
		NotebookPen,
		Lock,
		Settings,
		LogOut,
		ChevronRight,
		Plus
	} from '@lucide/svelte';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { ToastRegion } from '$lib/components/ui/toast';
	import { t, getLocale } from '$lib/i18n';
	import CompanionSwitcher from '$lib/components/shell/CompanionSwitcher.svelte';
	import { currentFabSection, orderFabActions } from '$lib/nav/fabSections';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const locale = getLocale();

	let activeCompanionId = $derived(page.params.companionId ?? null);
	let activeCompanion = $derived(
		data.companions.find((c) => c.id === activeCompanionId) ?? data.companions[0] ?? null
	);

	// Desktop pill nav items (Overview / Journal / Log)
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
						href: `/care/${activeCompanion.id}/journal`,
						label: t(locale, 'nav.journal'),
						icon: NotebookPen,
						restricted: true
					},
					{
						href: `/care/${activeCompanion.id}/log`,
						label: t(locale, 'nav.caretaker.logActivity'),
						icon: ClipboardList,
						restricted: true
					}
				]
			: []
	);

	// FAB
	const CARE_FAB_ICONS = { log: ClipboardList, journal: NotebookPen } as const;

	let fabOpen = $state(false);

	let fabActions = $derived(
		activeCompanion && data.isOnShift
			? orderFabActions(
					[
						{
							key: 'log',
							href: `/care/${activeCompanion.id}/log`,
							label: t(locale, 'nav.caretaker.logActivity')
						},
						{
							key: 'journal',
							href: `/care/${activeCompanion.id}/journal`,
							label: t(locale, 'nav.caretaker.addJournal')
						}
					],
					currentFabSection(page.url.pathname)
				)
			: []
	);

	function handleFabKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') fabOpen = false;
	}

	// Mobile nav active states (derived so they update reactively)
	let overviewHref = $derived(activeCompanion ? `/care/${activeCompanion.id}` : '');
	let journalHref = $derived(activeCompanion ? `/care/${activeCompanion.id}/journal` : '');
	let logHref = $derived(activeCompanion ? `/care/${activeCompanion.id}/log` : '');
	let overviewActive = $derived(page.url.pathname === overviewHref);
	let journalActive = $derived(
		page.url.pathname === journalHref || page.url.pathname.startsWith(journalHref + '/')
	);
	let logActive = $derived(
		page.url.pathname === logHref || page.url.pathname.startsWith(logHref + '/')
	);
	let journalLabel = $derived(t(locale, 'nav.journal'));
	let logLabel = $derived(t(locale, 'nav.caretaker.logActivity'));
	let overviewLabel = $derived(t(locale, 'nav.caretaker.overview'));
</script>

<div class="min-h-screen flex flex-col bg-background">
	<header
		class="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60"
	>
		<div class="mx-auto max-w-3xl px-4 sm:px-6">
			<div class="flex h-16 items-center justify-between gap-4">
				<!-- Logo (linked) -->
				<a
					href="/care/{activeCompanion?.id ?? ''}"
					class="logo-link hidden sm:flex items-center gap-2 shrink-0"
				>
					<PawLogo
						class="logo-paw w-7 h-7 text-muted-foreground transition-[color,transform] duration-200"
					/>
					<span class="font-display font-bold text-lg text-primary">EinVault</span>
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
			class="block border-b border-border bg-teal/10 hover:bg-teal/15 transition-colors"
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
						page.url.pathname === item.href ||
						(page.url.pathname.startsWith(item.href + '/') &&
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

	<ToastRegion ariaLabel={t(locale, 'common.reminder.toastAriaRegion')} />

	<!-- Mobile bottom nav -->
	{#if navItems.length > 0}
		<nav
			class="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card pb-safe z-30"
			aria-label={t(locale, 'aria.caretakerNav')}
		>
			<div class="relative flex items-end">
				<!-- Overview tab -->
				<a
					href={overviewHref}
					aria-current={overviewActive ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[56px] justify-end pb-2
						{overviewActive ? 'text-primary' : 'text-muted-foreground'}"
				>
					<Home class="h-5 w-5 mb-0.5" />
					{overviewLabel}
				</a>

				<!-- Journal tab (restricted) -->
				{#if !data.isOnShift}
					<span
						aria-label="{journalLabel} ({t(locale, 'layout.caretaker.requiresActiveShift')})"
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium opacity-40 cursor-not-allowed text-muted-foreground min-h-[56px] justify-end pb-2"
					>
						<NotebookPen class="h-5 w-5 mb-0.5" />
						{journalLabel}
					</span>
				{:else}
					<a
						href={journalHref}
						aria-current={journalActive ? 'page' : undefined}
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[56px] justify-end pb-2
							{journalActive ? 'text-primary' : 'text-muted-foreground'}"
					>
						<NotebookPen class="h-5 w-5 mb-0.5" />
						{journalLabel}
					</a>
				{/if}

				<!-- Central FAB slot (on shift only) -->
				{#if data.isOnShift}
					<div class="flex flex-col items-center flex-1 relative" style="padding-bottom: 8px;">
						<!-- FAB menu -->
						{#if fabOpen}
							<button
								type="button"
								class="fixed inset-0 z-40 cursor-default"
								onclick={() => (fabOpen = false)}
								aria-label={t(locale, 'aria.closeQuickAdd')}
								tabindex="-1"
							></button>
							<div
								class="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 bg-popover border border-border rounded-2xl shadow-xl overflow-hidden min-w-[200px]"
							>
								{#each fabActions as action (action.key)}
									{@const ActionIcon =
										CARE_FAB_ICONS[action.key as keyof typeof CARE_FAB_ICONS] ?? ClipboardList}
									<a
										href={action.href}
										onclick={() => (fabOpen = false)}
										class="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent {action.highlight
											? 'bg-primary/10 text-primary font-medium'
											: 'text-foreground'}"
									>
										<ActionIcon
											class="h-4 w-4 shrink-0 {action.highlight
												? 'text-primary'
												: 'text-muted-foreground'}"
										/>
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
							aria-label={t(locale, 'nav.fab.quickAdd')}
							aria-expanded={fabOpen}
							class="relative -top-3 h-12 w-12 rounded-full flex items-center justify-center text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
							style="background: linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7)); box-shadow: 0 8px 20px hsl(var(--primary) / 0.4);"
						>
							<Plus class="h-6 w-6 transition-transform {fabOpen ? 'rotate-45' : ''}" />
						</button>
					</div>
				{/if}

				<!-- Log tab (restricted) -->
				{#if !data.isOnShift}
					<span
						aria-label="{logLabel} ({t(locale, 'layout.caretaker.requiresActiveShift')})"
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium opacity-40 cursor-not-allowed text-muted-foreground min-h-[56px] justify-end pb-2"
					>
						<ClipboardList class="h-5 w-5 mb-0.5" />
						{logLabel}
					</span>
				{:else}
					<a
						href={logHref}
						aria-current={logActive ? 'page' : undefined}
						class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[56px] justify-end pb-2
							{logActive ? 'text-primary' : 'text-muted-foreground'}"
					>
						<ClipboardList class="h-5 w-5 mb-0.5" />
						{logLabel}
					</a>
				{/if}

				<!-- Settings tab -->
				<a
					href="/care/settings"
					aria-current={page.url.pathname.startsWith('/care/settings') ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors min-h-[56px] justify-end pb-2
						{page.url.pathname.startsWith('/care/settings') ? 'text-primary' : 'text-muted-foreground'}"
				>
					<Settings class="h-5 w-5 mb-0.5" />
					{t(locale, 'nav.settings')}
				</a>
			</div>
		</nav>
	{:else}
		<nav
			class="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card pb-safe z-30"
			aria-label={t(locale, 'aria.caretakerNav')}
		>
			<div class="flex">
				<a
					href="/care/settings"
					aria-current={page.url.pathname.startsWith('/care/settings') ? 'page' : undefined}
					class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors {page.url.pathname.startsWith(
						'/care/settings'
					)
						? 'text-primary'
						: 'text-muted-foreground'}"
				>
					<Settings class="h-5 w-5 mb-0.5" />
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
