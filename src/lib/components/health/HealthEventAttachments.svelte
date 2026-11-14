<script lang="ts">
	import { X } from '@lucide/svelte';
	import { DOCUMENT_ACCEPT } from '#lib/documentsApi.js';
	import type { AttachableDocument } from '#lib/dayItems.js';
	import { DOCUMENT_CATEGORIES } from '#lib/activityTypes.js';
	import type { PendingAttachments } from '#lib/healthAttachments.js';
	import { documentCategoryLabel } from '#lib/i18n/labels.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { Button } from '#lib/components/ui/button/index.js';

	// File, Paperless and existing-document pickers for a health event form.
	// Nothing is sent here: the parent applies `pending` after the event saves.
	// The parent also renders the PaperlessPicker and opens it via onbrowse.
	let {
		idPrefix,
		documents,
		attached,
		uploadMaxMb,
		paperlessEnabled,
		pending = $bindable(),
		onbrowse,
		disabled = false
	}: {
		idPrefix: string;
		documents: AttachableDocument[];
		attached?: { id: string; title: string }[];
		uploadMaxMb: number;
		paperlessEnabled: boolean;
		pending: PendingAttachments;
		onbrowse: () => void;
		disabled?: boolean;
	} = $props();
	const locale = getLocale();

	// linkIds and unlinkIds stay disjoint: unattached documents only touch
	// linkIds, attached ones only unlinkIds.
	function toggleLink(id: string, on: boolean) {
		const rest = pending.linkIds.filter((x) => x !== id);
		pending.linkIds = on ? [...rest, id] : rest;
	}
	function toggleUnlink(id: string) {
		pending.unlinkIds = pending.unlinkIds.includes(id)
			? pending.unlinkIds.filter((x) => x !== id)
			: [...pending.unlinkIds, id];
	}
	const showCategory = $derived(pending.files.length > 0 || pending.paperless.length > 0);
</script>

<div class="space-y-1.5">
	<label for="{idPrefix}-attach-files" class="text-sm font-medium"
		>{t(locale, 'attachments.files')}</label
	>
	<!-- No name: files go to the documents API after the event is saved. -->
	<input
		id="{idPrefix}-attach-files"
		data-testid="attach-files"
		type="file"
		multiple
		accept={DOCUMENT_ACCEPT}
		{disabled}
		onchange={(e) => (pending.files = Array.from(e.currentTarget.files ?? []))}
		class="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
	/>
	<p class="text-xs text-muted-foreground">
		{t(locale, 'page.documents.dropHint', { max: uploadMaxMb })}
	</p>
	{#if paperlessEnabled}
		<Button type="button" variant="outline" size="sm" {disabled} onclick={onbrowse}
			>{t(locale, 'paperless.picker.button')}</Button
		>
	{/if}
	{#if pending.paperless.length > 0}
		<ul class="space-y-1">
			{#each pending.paperless as pick (pick.paperlessId)}
				<li class="flex items-center justify-between gap-2 text-sm">
					<span class="truncate">{pick.title}</span>
					<button
						type="button"
						{disabled}
						class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground"
						aria-label={t(locale, 'attachments.removePick', { title: pick.title })}
						onclick={() =>
							(pending.paperless = pending.paperless.filter(
								(p) => p.paperlessId !== pick.paperlessId
							))}
					>
						<X class="size-4" aria-hidden="true" />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
{#if showCategory}
	<div class="space-y-1.5">
		<label for="{idPrefix}-attach-category" class="text-sm font-medium"
			>{t(locale, 'attachments.category')}</label
		>
		<select
			id="{idPrefix}-attach-category"
			bind:value={pending.category}
			{disabled}
			class="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
		>
			{#each DOCUMENT_CATEGORIES as c (c)}
				<option value={c}>{documentCategoryLabel(locale, c)}</option>
			{/each}
		</select>
	</div>
{/if}
{#if attached && attached.length > 0}
	<fieldset class="min-w-0 space-y-1.5">
		<legend class="text-sm font-medium">{t(locale, 'attachments.attached')}</legend>
		<ul class="space-y-1 rounded-md border border-input px-3 py-2">
			{#each attached as doc (doc.id)}
				{@const removing = pending.unlinkIds.includes(doc.id)}
				<li class="flex items-center justify-between gap-2 text-sm">
					<span class="min-w-0 truncate" class:line-through={removing}>{doc.title}</span>
					<span class="flex shrink-0 items-center gap-2">
						{#if removing}
							<span class="text-xs text-muted-foreground">{t(locale, 'attachments.removing')}</span>
						{/if}
						<Button
							type="button"
							variant="outline"
							size="sm"
							{disabled}
							onclick={() => toggleUnlink(doc.id)}
							>{t(locale, removing ? 'attachments.keep' : 'attachments.remove')}</Button
						>
					</span>
				</li>
			{/each}
		</ul>
	</fieldset>
{/if}
{#if documents.length > 0}
	<fieldset class="min-w-0 space-y-1.5">
		<legend class="text-sm font-medium">{t(locale, 'attachments.existing')}</legend>
		<div class="max-h-40 space-y-1 overflow-y-auto rounded-md border border-input px-3 py-2">
			{#each documents as doc (doc.id)}
				<label class="flex items-center gap-2 text-sm">
					<input
						type="checkbox"
						{disabled}
						checked={pending.linkIds.includes(doc.id)}
						onchange={(e) => toggleLink(doc.id, e.currentTarget.checked)}
					/>
					<span class="min-w-0 truncate">{doc.title} · {doc.date}</span>
				</label>
			{/each}
		</div>
	</fieldset>
{/if}
