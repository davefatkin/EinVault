<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Alert, AlertDescription } from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import PaperlessPicker from '$lib/components/PaperlessPicker.svelte';
	import DocumentPreview from '$lib/components/DocumentPreview.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeLabel } from '$lib/i18n/labels';
	import type { MessageKey } from '$lib/i18n/en';
	import { localDateISO } from '$lib/date';
	import { FileText, Upload, Download, Trash2, Pencil, Loader2 } from '@lucide/svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';

	let { data } = $props();
	const locale = getLocale();
	const categoryLabel = (c: string) => t(locale, `documents.category.${c}` as MessageKey);
	// Type · date · title — title alone is often ambiguous across visits.
	const healthEventLabel = (e: (typeof data.healthEvents)[number]) =>
		`${healthTypeLabel(locale, e.type)} · ${localDateISO(e.occurredAt)} · ${e.title}`;

	const CATEGORIES = ['receipt', 'invoice', 'medical', 'insurance', 'ownership', 'other'] as const;

	type Doc = (typeof data.documents)[number];
	const docUrl = (doc: Doc) => `/api/documents/${data.companion.id}/${doc.filename}`;

	let uploading = $state(false);
	let uploadError = $state('');
	let pickerOpen = $state(false);
	let filter = $state('all');
	let editingId = $state<string | null>(null);
	let editTitle = $state('');
	let editCategory = $state('other');
	let editDate = $state('');
	let editHealthEventId = $state('');
	let saveError = $state('');
	let deleteTarget = $state<Doc | null>(null);
	let preview = $state<Doc | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	const filtered = $derived(
		filter === 'all' ? data.documents : data.documents.filter((d) => d.category === filter)
	);

	async function upload(files: FileList | null) {
		if (!files || files.length === 0) return;
		uploading = true;
		uploadError = '';
		try {
			for (const file of files) {
				const form = new FormData();
				form.set('file', file);
				const res = await fetch(`/api/companions/${data.companion.id}/documents`, {
					method: 'POST',
					body: form
				});
				if (!res.ok) {
					const body = await res.json().catch(() => null);
					uploadError = body?.message ?? t(locale, 'page.documents.uploadFailed');
					break;
				}
			}
			await invalidateAll();
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function pickFromPaperless(paperlessId: number) {
		const res = await fetch(`/api/companions/${data.companion.id}/documents/from-paperless`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ paperlessId })
		});
		if (!res.ok) {
			uploadError = t(locale, 'paperless.picker.pickFailed');
			return;
		}
		pickerOpen = false;
		await invalidateAll();
	}

	function startEdit(doc: Doc) {
		editingId = doc.id;
		editTitle = doc.title;
		editCategory = doc.category;
		editDate = doc.documentDate ?? '';
		editHealthEventId = doc.healthEventId ?? '';
		saveError = '';
	}

	async function saveEdit() {
		if (!editingId) return;
		const res = await fetch(`/api/companions/${data.companion.id}/documents/${editingId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				title: editTitle,
				category: editCategory,
				documentDate: editDate || null,
				healthEventId: editHealthEventId || null
			})
		});
		if (!res.ok) {
			saveError = t(locale, 'page.documents.saveFailed');
			return;
		}
		editingId = null;
		await invalidateAll();
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		await fetch(`/api/companions/${data.companion.id}/documents/${deleteTarget.id}`, {
			method: 'DELETE'
		});
		deleteTarget = null;
		await invalidateAll();
	}

	function formatSize(bytes: number | null): string {
		if (!bytes) return '';
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	// Re-fires for a different document/companion (page component is reused
	// across companion navigations), idempotent for the same one.
	let lastDeepLinkId = '';
	$effect(() => {
		const previewId = page.url.searchParams.get('preview');
		if (!previewId || previewId === lastDeepLinkId) return;
		lastDeepLinkId = previewId;
		const match = data.documents.find((d) => d.id === previewId);
		if (match) preview = match;
		tick().then(() => {
			const url = new URL(page.url);
			url.searchParams.delete('preview');
			history.replaceState(history.state, '', url.pathname + url.search);
		});
	});
</script>

<svelte:head>
	<title>{t(locale, 'page.documents.title')} · {data.companion.name}</title>
</svelte:head>

<div class="space-y-6 pb-20 md:pb-0">
	{#if !data.companion.isActive}
		<div class="rounded-lg bg-muted/50 px-4 py-2.5 text-sm text-muted-foreground mb-4">
			{t(locale, 'page.documents.archivedNotice', { name: data.companion.name })}
		</div>
	{/if}

	<PageHeader title={t(locale, 'page.documents.title')} tint="muted">
		{#snippet icon()}<FileText class="h-5 w-5" />{/snippet}
		{#snippet actions()}
			{#if data.companion.isActive !== false}
				{#if data.paperlessEnabled}
					<Button variant="outline" size="sm" onclick={() => (pickerOpen = true)}>
						<FileText class="h-4 w-4 mr-1.5" />
						{t(locale, 'paperless.picker.button')}
					</Button>
				{/if}
				<Button size="sm" disabled={uploading} onclick={() => fileInput?.click()}>
					{#if uploading}
						<Loader2 class="h-4 w-4 mr-1.5 animate-spin" />
						{t(locale, 'page.documents.uploading')}
					{:else}
						<Upload class="h-4 w-4 mr-1.5" />
						{t(locale, 'page.documents.upload')}
					{/if}
				</Button>
				<input
					bind:this={fileInput}
					type="file"
					accept="application/pdf,image/jpeg,image/png,image/webp,image/heic"
					multiple
					class="hidden"
					onchange={(e) => upload(e.currentTarget.files)}
				/>
			{/if}
		{/snippet}
	</PageHeader>

	{#if uploadError}
		<Alert variant="coral">
			<AlertDescription>{uploadError}</AlertDescription>
		</Alert>
	{/if}

	<div class="space-y-3">
		{#if data.companion.isActive !== false}
			<p class="text-xs text-muted-foreground">
				{t(locale, 'page.documents.dropHint', { max: data.uploadMaxMb })}
			</p>
		{/if}

		<div
			class="flex flex-wrap gap-2"
			role="group"
			aria-label={t(locale, 'page.documents.filterAll')}
		>
			<button
				type="button"
				onclick={() => (filter = 'all')}
				aria-pressed={filter === 'all'}
				class="rounded-full border px-3 py-1 text-xs transition-colors {filter === 'all'
					? 'border-primary/40 bg-primary/10 text-primary font-medium'
					: 'border-border bg-card text-muted-foreground hover:bg-accent'}"
			>
				{t(locale, 'page.documents.filterAll')}
			</button>
			{#each CATEGORIES as c (c)}
				<button
					type="button"
					onclick={() => (filter = c)}
					aria-pressed={filter === c}
					class="rounded-full border px-3 py-1 text-xs transition-colors {filter === c
						? 'border-primary/40 bg-primary/10 text-primary font-medium'
						: 'border-border bg-card text-muted-foreground hover:bg-accent'}"
				>
					{categoryLabel(c)}
				</button>
			{/each}
		</div>

		{#if filtered.length === 0}
			<EmptyState
				tint="muted"
				title={t(locale, 'page.documents.empty')}
				body={t(locale, 'page.documents.emptyBody')}
			>
				{#snippet icon()}<FileText class="h-5 w-5" />{/snippet}
				{#snippet action()}
					{#if data.companion.isActive !== false}
						<Button onclick={() => fileInput?.click()}>{t(locale, 'page.documents.upload')}</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{:else}
			<ul class="divide-y divide-border">
				{#each filtered as doc (doc.id)}
					<li class="py-3">
						{#if editingId === doc.id}
							<div class="space-y-2">
								<div>
									<Label for="doc-title-{doc.id}">{t(locale, 'page.documents.labelTitle')}</Label>
									<Input
										id="doc-title-{doc.id}"
										value={editTitle}
										oninput={(e) => (editTitle = e.currentTarget.value)}
										maxlength={255}
									/>
								</div>
								<div class="flex gap-2">
									<div>
										<Label for="doc-cat-{doc.id}">{t(locale, 'page.documents.labelCategory')}</Label
										>
										<select
											id="doc-cat-{doc.id}"
											class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
											bind:value={editCategory}
										>
											{#each CATEGORIES as c (c)}
												<option value={c}>{categoryLabel(c)}</option>
											{/each}
										</select>
									</div>
									<div>
										<Label for="doc-date-{doc.id}">{t(locale, 'page.documents.labelDate')}</Label>
										<Input
											id="doc-date-{doc.id}"
											type="date"
											value={editDate}
											oninput={(e) => (editDate = e.currentTarget.value)}
										/>
									</div>
								</div>
								<div>
									<Label for="doc-event-{doc.id}">{t(locale, 'page.documents.linkedEvent')}</Label>
									<select
										id="doc-event-{doc.id}"
										class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
										bind:value={editHealthEventId}
									>
										<option value="">{t(locale, 'page.documents.noLinkedEvent')}</option>
										{#each data.healthEvents as event (event.id)}
											<option value={event.id}>{healthEventLabel(event)}</option>
										{/each}
									</select>
								</div>
								{#if saveError}
									<p class="text-sm text-coral">{saveError}</p>
								{/if}
								<div class="flex gap-2">
									<Button size="sm" onclick={saveEdit}>{t(locale, 'page.documents.save')}</Button>
									<Button variant="outline" size="sm" onclick={() => (editingId = null)}>
										{t(locale, 'common.cancel')}
									</Button>
								</div>
							</div>
						{:else}
							<div class="flex items-center gap-3">
								<button
									type="button"
									class="flex items-center gap-3 flex-1 min-w-0 text-left rounded-md px-2 py-1 -mx-2 hover:bg-accent transition-colors"
									onclick={() => (preview = doc)}
									aria-label={t(locale, 'page.documents.view')}
								>
									<FileText class="h-5 w-5 shrink-0 text-muted-foreground" />
									<div class="min-w-0">
										<p class="text-sm font-medium text-foreground truncate">{doc.title}</p>
										<p
											class="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap mt-0.5"
										>
											<Badge variant="secondary">{categoryLabel(doc.category)}</Badge>
											{#if doc.provider === 'paperless'}
												<Badge variant="outline">{t(locale, 'page.documents.fromPaperless')}</Badge>
											{/if}
											{#if doc.documentDate}<span>{doc.documentDate}</span>{/if}
											{#if doc.sizeBytes}<span>{formatSize(doc.sizeBytes)}</span>{/if}
											{#if doc.healthEvent}<span>· {doc.healthEvent.title}</span>{/if}
										</p>
									</div>
								</button>
								<div class="flex items-center gap-1 shrink-0">
									<Button
										href={`${docUrl(doc)}?download`}
										variant="soft"
										size="icon-sm"
										aria-label={t(locale, 'page.documents.download')}
									>
										<Download class="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="soft"
										size="icon-sm"
										aria-label={t(locale, 'page.documents.editTitle')}
										onclick={() => startEdit(doc)}
									>
										<Pencil class="h-4 w-4" />
									</Button>
									<Button
										type="button"
										variant="softDestructive"
										size="icon-sm"
										aria-label={t(locale, 'page.documents.delete')}
										onclick={() => (deleteTarget = doc)}
									>
										<Trash2 class="h-4 w-4" />
									</Button>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

{#if data.paperlessEnabled}
	<PaperlessPicker
		open={pickerOpen}
		onpick={pickFromPaperless}
		onclose={() => (pickerOpen = false)}
	/>
{/if}

{#if preview}
	<DocumentPreview
		open={true}
		url={docUrl(preview)}
		mimeType={preview.mimeType}
		title={preview.title}
		onclose={() => (preview = null)}
	/>
{/if}

<ConfirmDialog
	open={deleteTarget !== null}
	message={t(locale, 'page.documents.deleteConfirmBody')}
	confirmLabel={t(locale, 'page.documents.delete')}
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
/>
