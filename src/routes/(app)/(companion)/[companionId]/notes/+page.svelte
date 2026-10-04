<script lang="ts">
	import { StickyNote, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import NoteCard from '$lib/components/notes/NoteCard.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form } = $props();
	const locale = getLocale();

	const base = $derived(`/${data.companion.id}/notes`);
	const tagHref = (tag: string) => `${base}?tag=${encodeURIComponent(tag)}`;
	const chipClass = (on: boolean) =>
		`rounded-full border px-3 py-1 text-xs transition-colors ${
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

	{#if data.tags.length > 0}
		<nav class="flex flex-wrap gap-2" aria-label={t(locale, 'page.notes.filterLabel')}>
			<a
				href={base}
				class={chipClass(data.activeTag === null)}
				aria-current={data.activeTag === null ? 'page' : undefined}
			>
				{t(locale, 'page.notes.filterAll')}
			</a>
			{#each data.tags as { tag, count } (tag)}
				<a
					href={tagHref(tag)}
					class={chipClass(data.activeTag === tag)}
					aria-current={data.activeTag === tag ? 'page' : undefined}
				>
					{tag} <span class="opacity-60">{count}</span>
				</a>
			{/each}
		</nav>
	{/if}

	{#if data.notes.length === 0}
		{#if data.activeTag !== null}
			<EmptyState tint="muted" title={t(locale, 'page.notes.filterEmpty')}>
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
