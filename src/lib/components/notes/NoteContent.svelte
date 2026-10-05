<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';
	import NoteTags from './NoteTags.svelte';

	let {
		note,
		showTitle = true,
		tagHref
	}: {
		note: { title: string; body: string; tags: string[] };
		showTitle?: boolean;
		tagHref?: (tag: string) => string;
	} = $props();
</script>

<div class="space-y-3">
	{#if showTitle}
		<h2 class="font-display text-xl font-semibold text-foreground break-words">{note.title}</h2>
	{/if}
	<NoteTags tags={note.tags} {tagHref} />
	{#if note.body}
		<div class="prose prose-sm dark:prose-invert max-w-none break-words">
			{@html renderMarkdown(note.body)}
		</div>
	{/if}
</div>
