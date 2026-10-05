<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { t, getLocale } from '$lib/i18n';

	let {
		tags,
		tagHref
	}: {
		tags: string[];
		// When set, each tag links to its filtered list.
		tagHref?: (tag: string) => string;
	} = $props();
	const locale = getLocale();
</script>

{#if tags.length > 0}
	<ul class="flex flex-wrap gap-1.5" aria-label={t(locale, 'page.notes.labelTags')}>
		{#each tags as tag (tag)}
			<li>
				{#if tagHref}
					<a
						href={tagHref(tag)}
						class="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
					>
						<Badge variant="secondary">{tag}</Badge>
					</a>
				{:else}
					<Badge variant="secondary">{tag}</Badge>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
