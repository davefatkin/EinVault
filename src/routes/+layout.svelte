<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { setContext, untrack } from 'svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { applyTheme, readThemeCookie } from '$lib/theme';
	import DemoBar from '$components/demo/DemoBar.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	// untrack: serverTimezone and locale are server constants; capturing initial values only.
	setContext(
		'serverTimezone',
		untrack(() => data.serverTimezone)
	);
	setContext(
		'locale',
		untrack(() => data.locale)
	);

	$effect(() => {
		if (!browser) return;
		// In demo the seed account's stored theme ('system') can't be changed
		// (read-only), so honor the per-visitor cookie set by the settings card.
		const theme = data.demoMode ? (readThemeCookie() ?? 'system') : (data?.user?.theme ?? 'system');
		applyTheme(theme);

		if (theme === 'system') {
			const mq = window.matchMedia('(prefers-color-scheme: dark)');
			const handler = () => applyTheme('system');
			mq.addEventListener('change', handler);
			return () => mq.removeEventListener('change', handler);
		}
	});
</script>

<svelte:head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<meta name="description" content="EinVault: private dog health &amp; care tracker" />
</svelte:head>

{#if data.demoMode && data.user}
	<DemoBar currentRole={data.user.role} showNotice={data.demoNotice ?? false} />
{/if}

<!-- Expose the demo bar height so fixed/sticky layout chrome (sidebar, headers)
     can offset below it. display:contents keeps layout identical; the custom
     property still inherits to descendants. Defaults to 0 outside demo. -->
<div style:display="contents" style:--demo-bar-h={data.demoMode ? '2.5rem' : null}>
	{@render children()}
</div>
