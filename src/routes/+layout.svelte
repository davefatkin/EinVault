<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { setContext } from 'svelte';
	import type { LayoutData } from './$types';
	import type { Snippet } from 'svelte';
	import { applyTheme } from '$lib/theme';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	setContext('serverTimezone', data.serverTimezone);

	$effect(() => {
		if (!browser) return;
		const theme = data?.user?.theme ?? 'system';
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

{@render children()}
