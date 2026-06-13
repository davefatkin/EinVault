<script lang="ts">
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import AppFooter from '$lib/components/AppFooter.svelte';
	import { ToastRegion } from '$lib/components/ui/toast';
	import SearchPalette from '$lib/components/SearchPalette.svelte';
	import AppSidebar from '$lib/components/shell/AppSidebar.svelte';
	import AppMobileNav from '$lib/components/shell/AppMobileNav.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const locale = getLocale();

	let activeCompanionId = $derived(page.params.companionId ?? null);
	let activeCompanion = $derived(
		data.companions.find((c) => c.id === activeCompanionId) ??
			data.archivedCompanions?.find((c) => c.id === activeCompanionId) ??
			null
	);

	let searchOpen = $state(false);
</script>

<svelte:window
	onkeydown={(e) => {
		if (!(e.ctrlKey || e.metaKey) || e.key !== 'k' || e.defaultPrevented) return;
		const tgt = e.target as HTMLElement;
		if (
			tgt instanceof HTMLInputElement ||
			tgt instanceof HTMLTextAreaElement ||
			tgt.isContentEditable
		)
			return;
		e.preventDefault();
		searchOpen = true;
	}}
/>

<div class="min-h-screen md:flex bg-background">
	<!-- Desktop sidebar (hidden on mobile) -->
	<div class="hidden md:flex h-screen sticky top-0 shrink-0">
		<AppSidebar
			companions={data.companions}
			{activeCompanion}
			user={data.user}
			companionStatus={data.companionStatus}
			onOpenSearch={() => (searchOpen = true)}
		/>
	</div>

	<!-- Main content column -->
	<div class="flex-1 flex flex-col min-w-0">
		<!-- Mobile top bar + bottom tab bar (hidden on desktop) -->
		<AppMobileNav
			class="md:hidden"
			companions={data.companions}
			{activeCompanion}
			user={data.user}
			today={data.today}
			companionStatus={data.companionStatus}
			onOpenSearch={() => (searchOpen = true)}
		/>

		<main
			class="flex-1 min-w-0 animate-fade-in pb-24 md:pb-0 px-4 sm:px-6 lg:px-8 py-6 mx-auto w-full max-w-6xl"
		>
			{@render children()}
		</main>

		<AppFooter version={data.version} year={data.year} />
	</div>
</div>

<ToastRegion ariaLabel={t(locale, 'common.reminder.toastAriaRegion')} />

<SearchPalette
	bind:open={searchOpen}
	companions={data.companions.map((c) => ({ id: c.id, name: c.name }))}
/>
