<script lang="ts">
	import { StickyNote, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import NoteCard from '$lib/components/notes/NoteCard.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { notesFilterHref, type TagMatch } from '$lib/notes';

	let { data, form } = $props();
	const locale = getLocale();

	const base = $derived(`/${data.companion.id}/notes`);
	// Tags on a note card narrow the list to just that tag.
	const tagHref = (tag: string) => notesFilterHref(base, [tag], 'any');
	// A chip adds its tag to the selection or removes it, keeping match.
	const toggleHref = (tag: string) =>
		notesFilterHref(
			base,
			data.selectedTags.includes(tag)
				? data.selectedTags.filter((s) => s !== tag)
				: [...data.selectedTags, tag],
			data.match
		);
	// A selected tag no note has any more still gets a chip, so it can be removed.
	const staleTags = $derived(data.selectedTags.filter((s) => !data.tags.some((v) => v.tag === s)));
	const MATCH_MODES: { mode: TagMatch; key: 'page.notes.matchAny' | 'page.notes.matchAll' }[] = [
		{ mode: 'any', key: 'page.notes.matchAny' },
		{ mode: 'all', key: 'page.notes.matchAll' }
	];
	const chipClass = (on: boolean) =>
		`rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
			on
				? 'border-primary/40 bg-primary/10 text-primary font-medium'
				: 'border-border bg-card text-muted-foreground hover:bg-accent'
		}`;
</script>

<svelte:head>
	<title>{t(locale, 'page.notes.title')} · {data.companion.name}</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	{#if !data.companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground">
			{t(locale, 'page.notes.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<PageHeader title={t(locale, 'page.notes.title')} tint="muted">
		{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			<Button size="sm" href="{base}/new">
				<Plus class="h-4 w-4 mr-1.5" />
				{t(locale, 'page.notes.new')}
			</Button>
		{/snippet}
	</PageHeader>

	{#if form?.noteError}
		<Alert variant="coral"><AlertDescription>{form.noteError}</AlertDescription></Alert>
	{/if}

	{#if data.tags.length > 0 || staleTags.length > 0}
		<div class="space-y-3">
			<nav class="flex flex-wrap gap-2" aria-label={t(locale, 'page.notes.filterLabel')}>
				<a
					href={base}
					class={chipClass(!data.filtered)}
					aria-current={!data.filtered ? 'page' : undefined}
				>
					{t(locale, 'page.notes.filterAll')}
				</a>
				{#each data.tags as { tag, count } (tag)}
					{@const on = data.selectedTags.includes(tag)}
					<a href={toggleHref(tag)} class={chipClass(on)} aria-current={on ? 'true' : undefined}>
						{tag} <span class="opacity-60">{count}</span>
					</a>
				{/each}
				{#each staleTags as tag (tag)}
					<a href={toggleHref(tag)} class={chipClass(true)} aria-current="true">{tag}</a>
				{/each}
			</nav>
			{#if data.selectedTags.length >= 2}
				<div
					class="flex flex-wrap gap-2"
					role="group"
					aria-label={t(locale, 'page.notes.matchLabel')}
				>
					{#each MATCH_MODES as { mode, key } (mode)}
						<a
							href={notesFilterHref(base, data.selectedTags, mode)}
							class={chipClass(data.match === mode)}
							aria-current={data.match === mode ? 'true' : undefined}
						>
							{t(locale, key)}
						</a>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	{#if data.notes.length === 0}
		{#if data.filtered}
			<EmptyState
				tint="muted"
				title={t(
					locale,
					data.manyRequested ? 'page.notes.filterEmptyMany' : 'page.notes.filterEmpty'
				)}
			>
				{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
				{#snippet action()}
					<Button variant="outline" href={base}>{t(locale, 'page.notes.clearFilter')}</Button>
				{/snippet}
			</EmptyState>
		{:else}
			<EmptyState
				tint="muted"
				title={t(locale, 'page.notes.empty')}
				body={t(locale, 'page.notes.emptyBody')}
			>
				{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
				{#snippet action()}
					<Button href="{base}/new">{t(locale, 'page.notes.new')}</Button>
				{/snippet}
			</EmptyState>
		{/if}
	{:else}
		<ul class="space-y-3">
			{#each data.notes as note (note.id)}
				<li><NoteCard {note} href="{base}/{note.id}" {tagHref} /></li>
			{/each}
		</ul>
	{/if}
</div>
