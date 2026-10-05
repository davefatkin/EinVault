<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { TagInput } from '$lib/components/ui/tag-input';
	import MarkdownTextarea from '$lib/components/MarkdownTextarea.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { createDirtyGuard } from '$lib/dirtyGuard.svelte';
	import { NOTE_ERROR, NOTE_TITLE_MAX_LEN, NOTE_MAX_TAGS, normalizeTag } from '$lib/notes';
	import { t, getLocale } from '$lib/i18n';

	let {
		note,
		action,
		suggestions,
		cancelHref,
		companionName,
		error
	}: {
		note?: {
			title: string;
			body: string;
			tags: string[];
			pinned: boolean;
			sharedWithCaretakers: boolean;
		};
		action: string;
		suggestions: string[];
		cancelHref: string;
		companionName: string;
		error?: string;
	} = $props();
	const locale = getLocale();
	const guard = createDirtyGuard();
	const tagErrorText = (code: 'invalidTag' | 'tooManyTags') =>
		t(locale, NOTE_ERROR[code].key, NOTE_ERROR[code].params);

	// Seeded once from the prop: the editor owns its draft after mount.
	let title = $state(untrack(() => note?.title ?? ''));
	let body = $state(untrack(() => note?.body ?? ''));
	let tags = $state<string[]>(untrack(() => [...(note?.tags ?? [])]));
	let saving = $state(false);
	let formEl = $state<HTMLFormElement | null>(null);

	function onkeydown(e: KeyboardEvent) {
		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
			e.preventDefault();
			if (saving) return;
			formEl?.requestSubmit();
		}
	}

	function cancel() {
		guard.markClean();
		goto(cancelHref);
	}
</script>

<svelte:window {onkeydown} />

<form
	bind:this={formEl}
	method="POST"
	{action}
	class="space-y-5"
	oninput={() => guard.markDirty()}
	use:enhance={() => {
		saving = true;
		// Clear before the request: the success redirect fires beforeNavigate.
		guard.markClean();
		return async ({ result, update }) => {
			saving = false;
			if (result.type === 'failure' || result.type === 'error') guard.markDirty();
			await update({ reset: false });
		};
	}}
>
	{#if error}
		<Alert variant="coral"><AlertDescription>{error}</AlertDescription></Alert>
	{/if}

	<div class="space-y-1.5">
		<Label for="note-title">{t(locale, 'page.notes.labelTitle')}</Label>
		<Input
			id="note-title"
			name="title"
			required
			maxlength={NOTE_TITLE_MAX_LEN}
			placeholder={t(locale, 'page.notes.placeholderTitle')}
			value={title}
			oninput={(e) => (title = e.currentTarget.value)}
		/>
	</div>

	<div class="space-y-1.5">
		<Label for="note-body">{t(locale, 'page.notes.labelBody')}</Label>
		<MarkdownTextarea
			id="note-body"
			name="body"
			rows={12}
			placeholder={t(locale, 'page.notes.placeholderBody')}
			bind:value={body}
		/>
	</div>

	<div class="space-y-1.5">
		<Label for="note-tags">{t(locale, 'page.notes.labelTags')}</Label>
		<TagInput
			id="note-tags"
			bind:tags
			{suggestions}
			describedby="note-tags-hint"
			max={NOTE_MAX_TAGS}
			normalize={normalizeTag}
			invalidText={tagErrorText('invalidTag')}
			tooManyText={tagErrorText('tooManyTags')}
			onchange={() => guard.markDirty()}
		/>
		<p id="note-tags-hint" class="text-xs text-muted-foreground">
			{t(locale, 'page.notes.tagsHint', { max: NOTE_MAX_TAGS })}
		</p>
	</div>

	<div class="space-y-3">
		<label class="flex items-start gap-2 text-sm text-foreground">
			<input
				type="checkbox"
				name="shared"
				class="mt-0.5 h-4 w-4 accent-primary"
				checked={note?.sharedWithCaretakers ?? false}
			/>
			<span>
				{t(locale, 'page.notes.labelShared')}
				<span class="block text-xs text-muted-foreground">
					{t(locale, 'page.notes.sharedHint', { name: companionName })}
				</span>
			</span>
		</label>
		<label class="flex items-center gap-2 text-sm text-foreground">
			<input
				type="checkbox"
				name="pinned"
				class="h-4 w-4 accent-primary"
				checked={note?.pinned ?? false}
			/>
			{t(locale, 'page.notes.labelPinned')}
		</label>
	</div>

	<div class="flex items-center gap-2">
		<Button type="submit" disabled={saving}>
			{saving ? t(locale, 'common.saving') : t(locale, 'common.save')}
		</Button>
		<Button type="button" variant="ghost" onclick={cancel}>{t(locale, 'common.cancel')}</Button>
	</div>
</form>

<ConfirmDialog
	open={guard.pending !== null}
	message={t(locale, 'page.notes.unsavedPrompt')}
	confirmLabel={t(locale, 'page.notes.leave')}
	onconfirm={() => guard.confirmLeave()}
	oncancel={() => guard.cancelLeave()}
/>
