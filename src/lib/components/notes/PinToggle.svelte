<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pin } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		noteId,
		pinned,
		variant = 'icon'
	}: {
		noteId: string;
		pinned: boolean;
		// icon: a bare icon button (list cards). labeled: a soft button with text.
		variant?: 'icon' | 'labeled';
	} = $props();
	const locale = getLocale();

	// A toggle button keeps one name; aria-pressed carries the state.
	const label = t(locale, 'page.notes.pin');
</script>

<form method="POST" action="?/togglePin" use:enhance>
	<input type="hidden" name="id" value={noteId} />
	<input type="hidden" name="pinned" value={pinned ? 'false' : 'true'} />
	{#if variant === 'labeled'}
		<Button
			type="submit"
			variant="soft"
			size="sm"
			aria-pressed={pinned}
			class={pinned ? 'text-primary' : ''}
		>
			<Pin class="h-4 w-4 mr-1.5" fill={pinned ? 'currentColor' : 'none'} />{label}
		</Button>
	{:else}
		<button
			type="submit"
			aria-pressed={pinned}
			aria-label={label}
			class="rounded-md p-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring {pinned
				? 'text-primary'
				: 'text-muted-foreground'}"
		>
			<Pin class="h-4 w-4" fill={pinned ? 'currentColor' : 'none'} />
		</button>
	{/if}
</form>
