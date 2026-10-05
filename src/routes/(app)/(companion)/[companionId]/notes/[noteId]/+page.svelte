<script lang="ts">
	import { ChevronLeft, Pencil, Trash2, StickyNote } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ByLine from '$lib/components/ByLine.svelte';
	import NoteContent from '$lib/components/notes/NoteContent.svelte';
	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';
	import PinToggle from '$lib/components/notes/PinToggle.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form } = $props();
	const locale = getLocale();

	const base = $derived(`/${data.companion.id}/notes`);
	const tagHref = (tag: string) => `${base}?tag=${encodeURIComponent(tag)}`;
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
</script>

<svelte:head>
	<title>{data.note.title} · {data.companion.name}</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	<a
		href={base}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{t(locale, 'page.notes.backToList')}
	</a>

	{#if data.editing}
		<PageHeader title={data.note.title} tint="muted">
			{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
		</PageHeader>
		<NoteEditor
			note={data.note}
			action="?/update"
			suggestions={data.suggestions}
			cancelHref="{base}/{data.note.id}"
			companionName={data.companion.name}
			error={form?.noteError}
		/>
	{:else}
		{#if form?.noteError}
			<Alert variant="coral"><AlertDescription>{form.noteError}</AlertDescription></Alert>
		{/if}
		<PageHeader title={data.note.title} tint="muted">
			{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
			{#snippet actions()}
				<PinToggle noteId={data.note.id} pinned={data.note.pinned} variant="labeled" />
				<Button variant="soft" size="sm" href="?edit=1">
					<Pencil class="h-4 w-4 mr-1.5" />{t(locale, 'common.edit')}
				</Button>
				<Button variant="softDestructive" size="sm" onclick={() => (confirmDelete = true)}>
					<Trash2 class="h-4 w-4 mr-1.5" />{t(locale, 'page.notes.delete')}
				</Button>
			{/snippet}
		</PageHeader>

		<div class="flex flex-wrap items-center gap-2">
			{#if data.note.sharedWithCaretakers}
				<Badge variant="teal">{t(locale, 'page.notes.shared')}</Badge>
			{/if}
			<ByLine
				user={data.note.logger}
				updater={data.note.updatedBy && data.note.updatedBy !== data.note.loggedBy
					? data.note.updater
					: null}
				variant="inline"
				class="ml-0"
			/>
		</div>

		<NoteContent note={data.note} showTitle={false} {tagHref} />

		<form bind:this={deleteForm} method="POST" action="?/delete" class="hidden"></form>
		<ConfirmDialog
			open={confirmDelete}
			message={t(locale, 'page.notes.confirmDelete', { title: data.note.title })}
			onconfirm={() => {
				confirmDelete = false;
				deleteForm?.requestSubmit();
			}}
			oncancel={() => (confirmDelete = false)}
		/>
	{/if}
</div>
