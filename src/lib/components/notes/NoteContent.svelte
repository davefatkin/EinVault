<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { renderMarkdown } from '$lib/markdown';
	import { t, getLocale } from '$lib/i18n';

	let {
		note,
		showTitle = true,
		tagHref
	}: {
		note: { title: string; body: string; tags: string[] };
		showTitle?: boolean;
		tagHref?: (tag: string) => string;
	} = $props();
	const locale = getLocale();
</script>

<div class="space-y-3">
	{#if showTitle}
		<h2 class="font-display text-xl font-semibold text-foreground break-words">{note.title}</h2>
	{/if}
	{#if note.tags.length > 0}
		<ul class="flex flex-wrap gap-1.5" aria-label={t(locale, 'page.notes.labelTags')}>
			{#each note.tags as tag (tag)}
				<li>
					{#if tagHref}
						<a href={tagHref(tag)}><Badge variant="secondary">{tag}</Badge></a>
					{:else}
						<Badge variant="secondary">{tag}</Badge>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if note.body}
		<div class="prose prose-sm dark:prose-invert max-w-none break-words">
			{@html renderMarkdown(note.body)}
		</div>
	{/if}
</div>
