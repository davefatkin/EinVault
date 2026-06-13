<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { t, getLocale } from '$lib/i18n';

	let { children }: { children: Snippet } = $props();
	const locale = getLocale();

	const tabs = $derived([
		{ href: '/admin/users', label: t(locale, 'page.admin.usersTitle') },
		{ href: '/admin/companions', label: t(locale, 'page.admin.companionsTitle') }
	]);
	let pathname = $derived(page.url.pathname);
</script>

<div class="max-w-3xl mx-auto px-4 sm:px-6 pt-2">
	<nav class="flex gap-1.5 mb-5" aria-label="Admin sections">
		{#each tabs as tab (tab.href)}
			{@const active = pathname === tab.href || pathname.startsWith(tab.href + '/')}
			<a
				href={tab.href}
				aria-current={active ? 'page' : undefined}
				class="rounded-lg px-3 py-1.5 text-sm font-medium transition-colors {active
					? 'bg-primary/10 text-primary'
					: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}"
			>
				{tab.label}
			</a>
		{/each}
	</nav>
</div>

{@render children()}
