<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import {
		CheckCheck,
		FileText,
		Link2,
		Paperclip,
		Pencil,
		Plus,
		Printer,
		RotateCcw,
		Trash2
	} from '@lucide/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import ByLine from '#lib/components/ByLine.svelte';
	import Modal from '#lib/components/Modal.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import MediaManager from '#lib/components/MediaManager.svelte';
	import MediaThumbs from '#lib/components/MediaThumbs.svelte';
	import MediaLightbox from '#lib/components/MediaLightbox.svelte';
	import DocumentPreview from '#lib/components/DocumentPreview.svelte';
	import PaperlessPicker from '#lib/components/PaperlessPicker.svelte';
	import LinkEventPicker from './LinkEventPicker.svelte';
	import SeverityChip from './SeverityChip.svelte';
	import IncidentTimeline from './IncidentTimeline.svelte';
	import IncidentForm from './IncidentForm.svelte';
	import IncidentUpdateForm from './IncidentUpdateForm.svelte';
	import ResolveIncidentDialog from './ResolveIncidentDialog.svelte';
	import { renderMarkdown } from '#lib/markdown.js';
	import { healthTypeLabel } from '#lib/i18n/labels.js';
	import {
		DOCUMENT_ACCEPT,
		attachDocument,
		importFromPaperless,
		uploadDocument
	} from '#lib/documentsApi.js';
	import { incidentMediaApi, uploadEach } from '#lib/mediaApi.js';
	import type { MediaItem } from '#lib/media.js';
	import type { HealthEventType } from '#lib/health.js';
	import {
		MAX_INCIDENT_MEDIA,
		incidentDayNumber,
		type DocRef,
		type IncidentCaps,
		type IncidentDetailData
	} from '#lib/incidents.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// The incident page, shared by the owner and caretaker routes. Everything a
	// viewer may do comes from `caps` and the action URLs in `forms`; anything
	// the loader left out (documents, journal days) simply doesn't render.
	let {
		data,
		companionId,
		caps,
		mediaUrl,
		forms,
		uploadMaxMb,
		videoMaxMb,
		currentUserId,
		allowTime = false,
		linkCandidates = [],
		paperlessEnabled = false
	}: {
		data: IncidentDetailData;
		companionId: string;
		caps: IncidentCaps;
		mediaUrl: (item: MediaItem) => string;
		forms: {
			addUpdate: string;
			editUpdate: string;
			deleteUpdate: string;
			resolve?: string;
			reopen?: string;
			editOverview?: string;
			delete?: string;
			link?: string;
			unlink?: string;
		};
		uploadMaxMb: number;
		videoMaxMb: number;
		currentUserId: string;
		/** Whether the viewer sets the time of updates (owners) or they are "now". */
		allowTime?: boolean;
		/** Health events that can still be linked (owners only). */
		linkCandidates?: {
			id: string;
			type: HealthEventType;
			title: string;
			occurredAt: Date | string;
		}[];
		paperlessEnabled?: boolean;
	} = $props();
	const locale = getLocale();

	const incident = $derived(data.incident);
	const resolved = $derived(incident.resolvedAt !== null);
	const mediaHint = $derived(t(locale, 'media.types', { imgMax: uploadMaxMb, vidMax: videoMaxMb }));
	// Owners may change any photo; others only their own (the server agrees).
	const canModifyMedia = (item: MediaItem) =>
		caps.canEditOverview || item.loggedBy === currentUserId;

	// MediaManager owns the overview list after load; a reload resets it.
	let overviewMedia = $derived<MediaItem[]>(data.overviewMedia);
	const overviewApi = $derived(incidentMediaApi(companionId, incident.id, null, locale));

	// One lightbox for every read-only thumbnail row on the page.
	let lightboxItems = $state<MediaItem[]>([]);
	let lightboxIndex = $state(0);
	let lightboxOpen = $state(false);
	function openMedia(items: MediaItem[], index: number) {
		lightboxItems = items;
		lightboxIndex = index;
		lightboxOpen = true;
	}

	let previewDoc = $state<DocRef | null>(null);
	const docUrl = (doc: DocRef) => `/api/documents/${companionId}/${doc.filename}`;

	// + Update: saves the update, then uploads the picked files to it.
	let addOpen = $state(false);
	let addPhase = $state<'form' | 'saving' | 'failed'>('form');
	let addError = $state<string | null>(null);
	let addFiles = $state<File[]>([]);
	let addFailures = $state<{ name: string; message: string }[]>([]);
	function openAdd() {
		addPhase = 'form';
		addError = null;
		addFiles = [];
		addFailures = [];
		addOpen = true;
	}
	const submitAdd: SubmitFunction = ({ cancel }) => {
		if (addPhase !== 'form') {
			cancel();
			return;
		}
		addPhase = 'saving';
		addError = null;
		return async ({ result, update }) => {
			if (result.type === 'failure') {
				addPhase = 'form';
				addError = String(result.data?.error ?? t(locale, 'media.actionFailed'));
				return;
			}
			if (result.type !== 'success') {
				addPhase = 'form';
				await update();
				return;
			}
			// The update exists from here on: never return to the form.
			const updateId = String(result.data?.updateId ?? '');
			const failed =
				updateId && addFiles.length > 0
					? await uploadEach(incidentMediaApi(companionId, incident.id, updateId, locale), addFiles)
					: [];
			await refreshAll();
			if (failed.length > 0) {
				addFailures = failed;
				addPhase = 'failed';
			} else {
				addOpen = false;
			}
		};
	};

	let linkOpen = $state(false);

	// Attach document: files upload (or a Paperless import is filed) straight
	// onto the incident through the documents API, then the page reloads.
	let attachInput = $state<HTMLInputElement | null>(null);
	let attaching = $state(false);
	let attachFailures = $state<{ name: string; message: string }[]>([]);
	let paperlessOpen = $state(false);
	async function attachFiles(files: File[]) {
		if (files.length === 0) return;
		attaching = true;
		attachFailures = [];
		const failed: { name: string; message: string }[] = [];
		for (const file of files) {
			const r = await uploadDocument(companionId, file, { healthEventId: incident.id }, locale);
			if (!r.ok) failed.push({ name: file.name, message: r.message });
		}
		attachFailures = failed;
		await refreshAll();
		attaching = false;
	}
	async function pickFromPaperless(paperlessId: number) {
		attachFailures = [];
		const imported = await importFromPaperless(companionId, paperlessId, locale);
		const r = imported.ok
			? await attachDocument(companionId, imported.value.id, incident.id, locale)
			: imported;
		if (!r.ok) attachFailures = [{ name: 'Paperless', message: r.message }];
		paperlessOpen = false;
		await refreshAll();
	}

	let resolveOpen = $state(false);

	let editOpen = $state(false);
	let editSaving = $state(false);
	let editError = $state<string | null>(null);
	const submitEdit: SubmitFunction = () => {
		editSaving = true;
		editError = null;
		return async ({ result, update }) => {
			editSaving = false;
			if (result.type === 'failure') {
				editError = String(result.data?.error ?? t(locale, 'media.actionFailed'));
				return;
			}
			await update();
			if (result.type === 'success') editOpen = false;
		};
	};

	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
</script>

<article class="incident-print space-y-6">
	<header class="space-y-2">
		<h1 class="font-display text-2xl font-bold text-foreground break-words">{incident.title}</h1>
		<div class="flex flex-wrap items-center gap-2">
			{#if resolved}
				<Badge variant="secondary" data-testid="incident-status">
					{t(locale, 'page.incident.resolved')}&nbsp;<LocalTime date={incident.resolvedAt} />
				</Badge>
			{:else}
				<Badge variant="primary" data-testid="incident-status">
					{t(locale, 'page.incident.ongoingDay', { day: incidentDayNumber(incident.occurredAt) })}
				</Badge>
			{/if}
			{#if data.currentSeverity}
				<SeverityChip severity={data.currentSeverity} data-testid="incident-severity" />
			{/if}
		</div>
		<p class="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
			<span>{t(locale, 'page.incident.started')}</span>
			<LocalTime date={incident.occurredAt} format="datetime" />
			<ByLine user={incident.logger} variant="inline" />
		</p>
	</header>

	<div class="flex flex-wrap items-center gap-2 print:hidden">
		{#if caps.canAddUpdate}
			<Button size="sm" onclick={openAdd}>
				<Plus class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.addUpdate')}
			</Button>
		{/if}
		{#if caps.canResolve && !resolved && forms.resolve}
			<Button variant="outline" size="sm" onclick={() => (resolveOpen = true)}>
				<CheckCheck class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.markResolved')}
			</Button>
		{/if}
		{#if caps.canResolve && resolved && forms.reopen}
			<form method="POST" action={forms.reopen} use:enhance>
				<Button type="submit" variant="outline" size="sm">
					<RotateCcw class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.reopen')}
				</Button>
			</form>
		{/if}
		{#if caps.canLink && forms.link}
			<Button variant="outline" size="sm" onclick={() => (linkOpen = true)}>
				<Link2 class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.linkVet')}
			</Button>
		{/if}
		{#if caps.canAttachDocuments}
			<input
				bind:this={attachInput}
				type="file"
				multiple
				accept={DOCUMENT_ACCEPT}
				class="hidden"
				data-testid="incident-attach-file"
				onchange={(e) => {
					const files = Array.from(e.currentTarget.files ?? []);
					e.currentTarget.value = '';
					void attachFiles(files);
				}}
			/>
			<Button variant="outline" size="sm" disabled={attaching} onclick={() => attachInput?.click()}>
				<Paperclip class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.attachDocument')}
			</Button>
			{#if paperlessEnabled}
				<Button variant="outline" size="sm" onclick={() => (paperlessOpen = true)}>
					{t(locale, 'paperless.picker.button')}
				</Button>
			{/if}
		{/if}
		<Button variant="outline" size="sm" onclick={() => window.print()}>
			<Printer class="h-4 w-4 mr-1.5" />{t(locale, 'page.incident.print')}
		</Button>
		{#if caps.canEditOverview && forms.editOverview}
			<Button
				variant="soft"
				size="sm"
				data-testid="incident-edit"
				onclick={() => (editOpen = true)}
			>
				<Pencil class="h-4 w-4 mr-1.5" />{t(locale, 'common.edit')}
			</Button>
		{/if}
		{#if caps.canDelete && forms.delete}
			<Button
				variant="softDestructive"
				size="sm"
				data-testid="incident-delete"
				onclick={() => (confirmDelete = true)}
			>
				<Trash2 class="h-4 w-4 mr-1.5" />{t(locale, 'common.delete')}
			</Button>
		{/if}
	</div>

	{#if attachFailures.length > 0}
		<div role="alert" class="space-y-1 text-sm text-destructive print:hidden">
			<p>{t(locale, 'page.incident.attachFailed')}</p>
			<ul class="list-disc pl-5">
				{#each attachFailures as f, i (i)}
					<li>{t(locale, 'page.journal.day.fileFailed', { name: f.name, message: f.message })}</li>
				{/each}
			</ul>
		</div>
	{/if}

	<section
		class="space-y-3 rounded-2xl border bg-card p-5 break-inside-avoid"
		aria-labelledby="incident-overview"
	>
		<h2
			id="incident-overview"
			class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:text-foreground"
		>
			{t(locale, 'page.incident.overview')}
		</h2>
		{#if incident.notes}
			<div class="prose prose-sm dark:prose-invert max-w-none break-words">
				{@html renderMarkdown(incident.notes)}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">{t(locale, 'page.incident.noNotes')}</p>
		{/if}
		{#if caps.canEditOverview}
			<div class="print:hidden">
				<MediaManager
					bind:items={overviewMedia}
					api={overviewApi}
					max={MAX_INCIDENT_MEDIA}
					canModify={canModifyMedia}
					immichEnabled={false}
					{uploadMaxMb}
					{videoMaxMb}
					title={t(locale, 'media.title')}
				/>
			</div>
			<div class="hidden print:block">
				<MediaThumbs items={overviewMedia} urlFor={mediaUrl} onopen={() => {}} />
			</div>
		{:else}
			<MediaThumbs
				items={overviewMedia}
				urlFor={mediaUrl}
				onopen={(i) => openMedia(overviewMedia, i)}
			/>
		{/if}
	</section>

	<section class="space-y-3" aria-labelledby="incident-progress">
		<h2
			id="incident-progress"
			class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:text-foreground"
		>
			{t(locale, 'page.incident.progress')}
		</h2>
		<IncidentTimeline
			items={data.timeline}
			{companionId}
			incidentId={incident.id}
			{caps}
			{canModifyMedia}
			{allowTime}
			unlinkAction={caps.canLink ? forms.unlink : undefined}
			editAction={forms.editUpdate}
			deleteAction={forms.deleteUpdate}
			{mediaUrl}
			{uploadMaxMb}
			{videoMaxMb}
			onopenMedia={openMedia}
			onpreviewDoc={(doc) => (previewDoc = doc)}
		/>
	</section>

	{#if data.journalDates.length > 0 || data.documents.length > 0}
		<section class="space-y-2 break-inside-avoid" aria-labelledby="incident-related">
			<h2
				id="incident-related"
				class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground print:text-foreground"
			>
				{t(locale, 'page.incident.related')}
			</h2>
			{#if data.journalDates.length > 0}
				<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
					<span class="text-muted-foreground">{t(locale, 'page.incident.journal')}:</span>
					{#each data.journalDates as date (date)}
						<a href="/{companionId}/journal/{date}" class="text-primary-link hover:underline"
							><LocalTime {date} /></a
						>
					{/each}
				</p>
			{/if}
			{#if data.documents.length > 0}
				<p class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
					<span class="text-muted-foreground">{t(locale, 'page.incident.documents')}:</span>
					{#each data.documents as doc (doc.id)}
						<button
							type="button"
							class="inline-flex items-center gap-1 text-primary-link hover:underline"
							onclick={() => (previewDoc = doc)}
						>
							<FileText class="h-3.5 w-3.5" />{doc.title}
						</button>
					{/each}
				</p>
			{/if}
		</section>
	{/if}
</article>

{#if addOpen}
	<Modal
		title={t(locale, 'page.incident.newUpdateTitle')}
		onclose={() => (addOpen = false)}
		locked={addPhase === 'saving'}
	>
		{#if addPhase === 'failed'}
			<div class="space-y-3 text-sm">
				<p role="alert">{t(locale, 'page.incident.filesFailed')}</p>
				<ul class="list-disc space-y-1 pl-5 text-destructive">
					{#each addFailures as f, i (i)}
						<li>
							{t(locale, 'page.journal.day.fileFailed', { name: f.name, message: f.message })}
						</li>
					{/each}
				</ul>
				<Button variant="outline" onclick={() => (addOpen = false)}
					>{t(locale, 'common.close')}</Button
				>
			</div>
		{:else}
			{#if addError}<p role="alert" class="mb-3 text-sm text-destructive">{addError}</p>{/if}
			<IncidentUpdateForm
				action={forms.addUpdate}
				submit={submitAdd}
				idPrefix="new-update"
				{allowTime}
				submitting={addPhase === 'saving'}
				onfiles={(files) => (addFiles = files)}
				{mediaHint}
				oncancel={() => (addOpen = false)}
			/>
		{/if}
	</Modal>
{/if}

{#if linkOpen && forms.link}
	<Modal title={t(locale, 'page.incident.linkPickerTitle')} onclose={() => (linkOpen = false)}>
		<LinkEventPicker
			items={linkCandidates.map((c) => ({
				id: c.id,
				label: c.title,
				badge: healthTypeLabel(locale, c.type),
				date: c.occurredAt
			}))}
			action={forms.link}
			idField="healthEventId"
			emptyText={t(locale, 'page.incident.linkNone')}
			onlinked={() => (linkOpen = false)}
		/>
	</Modal>
{/if}

{#if paperlessEnabled && caps.canAttachDocuments}
	<PaperlessPicker
		open={paperlessOpen}
		onpick={pickFromPaperless}
		onclose={() => (paperlessOpen = false)}
	/>
{/if}

{#if resolveOpen && forms.resolve}
	<ResolveIncidentDialog action={forms.resolve} onclose={() => (resolveOpen = false)} />
{/if}

{#if editOpen && forms.editOverview}
	<Modal
		title={t(locale, 'page.incident.editTitle')}
		onclose={() => (editOpen = false)}
		locked={editSaving}
	>
		{#if editError}<p role="alert" class="mb-3 text-sm text-destructive">{editError}</p>{/if}
		<IncidentForm
			action={forms.editOverview}
			submit={submitEdit}
			values={incident}
			allowStart={allowTime}
			submitting={editSaving}
			submitLabel={t(locale, 'common.save')}
			oncancel={() => (editOpen = false)}
		/>
	</Modal>
{/if}

{#if forms.delete}
	<form
		bind:this={deleteForm}
		method="POST"
		action={forms.delete}
		use:enhance
		class="hidden"
	></form>
	<ConfirmDialog
		open={confirmDelete}
		message={t(locale, 'page.incident.confirmDelete', { title: incident.title })}
		onconfirm={() => {
			confirmDelete = false;
			deleteForm?.requestSubmit();
		}}
		oncancel={() => (confirmDelete = false)}
	/>
{/if}

<MediaLightbox
	items={lightboxItems}
	urlFor={mediaUrl}
	bind:open={lightboxOpen}
	bind:index={lightboxIndex}
/>

{#if previewDoc}
	<DocumentPreview
		open={true}
		url={docUrl(previewDoc)}
		mimeType={previewDoc.mimeType}
		title={previewDoc.title}
		onclose={() => (previewDoc = null)}
	/>
{/if}
