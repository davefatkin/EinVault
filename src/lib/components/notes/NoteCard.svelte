<script lang="ts">
	import { enhance } from '$app/forms';
	import { Pin, PinOff } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ByLine from '$lib/components/ByLine.svelte';
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
			{#if note.tags.length > 0}
				<ul class="flex flex-wrap gap-1.5" aria-label={t(locale, 'page.notes.labelTags')}>
					{#each note.tags as tag (tag)}
						<li><a href={tagHref(tag)}><Badge variant="secondary">{tag}</Badge></a></li>
					{/each}
				</ul>
			{/if}
			<ByLine
				user={note.logger}
				updater={note.updatedBy && note.updatedBy !== note.loggedBy ? note.updater : null}
				variant="inline"
				class="ml-0"
			/>
		</div>
		<form method="POST" action="?/togglePin" use:enhance>
			<input type="hidden" name="id" value={note.id} />
			<input type="hidden" name="pinned" value={note.pinned ? 'false' : 'true'} />
			<button
				type="submit"
				aria-pressed={note.pinned}
				aria-label={t(locale, note.pinned ? 'page.notes.unpin' : 'page.notes.pin')}
				class="rounded-md p-1.5 transition-colors hover:bg-accent {note.pinned
					? 'text-primary'
					: 'text-muted-foreground'}"
			>
				{#if note.pinned}<Pin class="h-4 w-4" />{:else}<PinOff class="h-4 w-4" />{/if}
			</button>
		</form>
	</div>
</article>
