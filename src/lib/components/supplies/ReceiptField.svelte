<script lang="ts">
	import { FileText, X } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { DOCUMENT_ACCEPT } from '#lib/documentsApi.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// A purchase's receipt: a `receipt` file, or a Paperless pick posted as
	// `paperlessId`. One at a time: a pick clears the file. The parent renders
	// the PaperlessPicker (a Modal's transform would trap its overlay) and sets
	// `paperlessId` from it.
	let {
		idPrefix,
		paperlessEnabled,
		paperlessId = $bindable(null),
		onbrowse
	}: {
		idPrefix: string;
		paperlessEnabled: boolean;
		paperlessId?: number | null;
		onbrowse: () => void;
	} = $props();
	const locale = getLocale();

	let fileInput = $state<HTMLInputElement | null>(null);
	$effect(() => {
		if (paperlessId !== null && fileInput) fileInput.value = '';
	});
</script>

<div class="space-y-1.5">
	<Label for="{idPrefix}-receipt">{t(locale, 'page.supplies.labelReceipt')}</Label>
	{#if paperlessId !== null}
		<input type="hidden" name="paperlessId" value={paperlessId} />
		<div class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
			<FileText class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
			<span class="min-w-0 flex-1 truncate"
				>{t(locale, 'page.supplies.paperlessPicked', { id: paperlessId })}</span
			>
			<Button
				type="button"
				variant="ghost"
				size="icon-sm"
				aria-label={t(locale, 'page.supplies.clearReceipt')}
				title={t(locale, 'page.supplies.clearReceipt')}
				onclick={() => (paperlessId = null)}
			>
				<X class="h-4 w-4" />
			</Button>
		</div>
	{/if}
	<div class="flex flex-wrap items-center gap-2" hidden={paperlessId !== null}>
		<input
			bind:this={fileInput}
			id="{idPrefix}-receipt"
			name="receipt"
			type="file"
			accept={DOCUMENT_ACCEPT}
			aria-describedby="{idPrefix}-receipt-hint"
			class="min-w-0 max-w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
		/>
		{#if paperlessEnabled}
			<Button type="button" variant="outline" size="sm" onclick={onbrowse}>
				<FileText class="h-4 w-4 mr-1.5" />{t(locale, 'paperless.picker.button')}
			</Button>
		{/if}
	</div>
	<p id="{idPrefix}-receipt-hint" class="text-xs text-muted-foreground">
		{t(locale, 'page.supplies.receiptHint')}
	</p>
</div>
