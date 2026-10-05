<script lang="ts">
	import { StickyNote } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import NoteEditor from '$lib/components/notes/NoteEditor.svelte';
	import { t, getLocale } from '$lib/i18n';

	let { data, form } = $props();
	const locale = getLocale();
</script>

<svelte:head>
	<title>{t(locale, 'page.notes.new')} · {data.companion.name}</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	<PageHeader title={t(locale, 'page.notes.new')} tint="muted">
		{#snippet icon()}<StickyNote class="h-5 w-5" />{/snippet}
	</PageHeader>
	<NoteEditor
		note={form?.values}
		action="?/create"
		suggestions={data.suggestions}
		cancelHref="/{data.companion.id}/notes"
		companionName={data.companion.name}
		error={form?.noteError}
	/>
</div>
