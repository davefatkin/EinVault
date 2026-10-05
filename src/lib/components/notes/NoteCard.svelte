<script lang="ts">
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ByLine from '$lib/components/ByLine.svelte';
	import NoteTags from './NoteTags.svelte';
	import PinToggle from './PinToggle.svelte';
	import { stripMarkdown } from '$lib/markdown';
	import { t, getLocale } from '$lib/i18n';
	import type { UserRef } from '$lib/types';

	let {
		note,
		href,
		tagHref
	}: {
		note: {
			id: string;
			title: string;
			body: string;
			tags: string[];
			pinned: boolean;
			sharedWithCaretakers: boolean;
			loggedBy: string | null;
			updatedBy: string | null;
			logger: UserRef;
			updater: UserRef;
		};
		href: string;
		tagHref: (tag: string) => string;
	} = $props();
	const locale = getLocale();

	const preview = $derived(stripMarkdown(note.body).replace(/\s+/g, ' '));
</script>

<article class="rounded-lg border border-border bg-card p-4">
	<div class="flex items-start gap-3">
		<div class="min-w-0 flex-1 space-y-1.5">
			<div class="flex flex-wrap items-center gap-2">
				<a {href} class="font-medium text-foreground hover:underline break-words">{note.title}</a>
				{#if note.sharedWithCaretakers}
					<Badge variant="teal">{t(locale, 'page.notes.shared')}</Badge>
				{/if}
			</div>
			{#if preview}
				<p class="line-clamp-2 text-sm text-muted-foreground">{preview}</p>
			{/if}
			<NoteTags tags={note.tags} {tagHref} />
			<ByLine
				user={note.logger}
				updater={note.updatedBy && note.updatedBy !== note.loggedBy ? note.updater : null}
				variant="inline"
				class="ml-0"
			/>
		</div>
		<PinToggle noteId={note.id} pinned={note.pinned} />
	</div>
</article>
