<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Pencil, Trash2 } from '@lucide/svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import ByLine from '#lib/components/ByLine.svelte';
	import MediaThumbs from '#lib/components/MediaThumbs.svelte';
	import MediaManager from '#lib/components/MediaManager.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import SeverityChip from './SeverityChip.svelte';
	import IncidentUpdateForm from './IncidentUpdateForm.svelte';
	import { renderMarkdown } from '#lib/markdown.js';
	import { incidentMediaApi } from '#lib/mediaApi.js';
	import { MAX_INCIDENT_MEDIA, type UpdateView } from '#lib/incidents.js';
	import type { MediaItem } from '#lib/media.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// One update on the incident timeline. Read-only thumbnails by default;
	// Edit swaps in the update form and a MediaManager for its photos.
	let {
		update,
		companionId,
		incidentId,
		canEdit,
		canModifyMedia,
		allowTime,
		editAction,
		deleteAction,
		mediaUrl,
		uploadMaxMb,
		videoMaxMb,
		onopenMedia
	}: {
		update: UpdateView;
		companionId: string;
		incidentId: string;
		canEdit: boolean;
		canModifyMedia: (item: MediaItem) => boolean;
		allowTime: boolean;
		editAction: string;
		deleteAction: string;
		mediaUrl: (item: MediaItem) => string;
		uploadMaxMb: number;
		videoMaxMb: number;
		onopenMedia: (items: MediaItem[], index: number) => void;
	} = $props();
	const locale = getLocale();

	let editing = $state(false);
	let saving = $state(false);
	let error = $state<string | null>(null);
	let confirmDelete = $state(false);
	let deleteForm = $state<HTMLFormElement | null>(null);
	// MediaManager owns the list while editing; a reload resets it.
	let media = $derived<MediaItem[]>(update.media);
	const api = $derived(incidentMediaApi(companionId, incidentId, update.id, locale));

	const submitEdit: SubmitFunction = () => {
		saving = true;
		error = null;
		return async ({ result, update: apply }) => {
			saving = false;
			if (result.type === 'failure') {
				error = String(result.data?.error ?? t(locale, 'media.actionFailed'));
				return;
			}
			await apply();
			if (result.type === 'success') editing = false;
		};
	};
</script>

<li id="update-{update.id}" class="incident-tl-item relative scroll-mt-24">
	<span
		class="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-muted-foreground/60 ring-4 ring-background"
		aria-hidden="true"
	></span>
	{#if editing}
		<div class="space-y-4 rounded-xl border border-border bg-card p-4 print:hidden">
			{#if error}<p role="alert" class="text-sm text-destructive">{error}</p>{/if}
			<IncidentUpdateForm
				action={editAction}
				submit={submitEdit}
				idPrefix="edit-{update.id}"
				updateId={update.id}
				values={update}
				{allowTime}
				submitting={saving}
				oncancel={() => {
					editing = false;
					error = null;
				}}
			/>
			<MediaManager
				bind:items={media}
				{api}
				max={MAX_INCIDENT_MEDIA}
				canModify={canModifyMedia}
				immichEnabled={false}
				{uploadMaxMb}
				{videoMaxMb}
				title={t(locale, 'media.title')}
			/>
		</div>
	{/if}
	<div class={['space-y-1.5', editing && 'hidden print:block']}>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
			{#if update.severity}<SeverityChip severity={update.severity} />{/if}
			<LocalTime date={update.occurredAt} format="datetime" />
			<ByLine user={update.logger} variant="inline" class="ml-0" />
			{#if canEdit}
				<span class="ml-auto flex gap-1 print:hidden">
					<Button
						type="button"
						variant="soft"
						size="sm"
						class="h-7 gap-1.5 px-2 text-xs"
						onclick={() => (editing = true)}
					>
						<Pencil class="h-3.5 w-3.5" />{t(locale, 'common.edit')}
					</Button>
					<Button
						type="button"
						variant="softDestructive"
						size="sm"
						class="h-7 gap-1.5 px-2 text-xs"
						onclick={() => (confirmDelete = true)}
					>
						<Trash2 class="h-3.5 w-3.5" />{t(locale, 'common.delete')}
					</Button>
				</span>
			{/if}
		</div>
		<div class="prose prose-sm dark:prose-invert max-w-none break-words text-foreground">
			{@html renderMarkdown(update.body)}
		</div>
		<MediaThumbs items={media} urlFor={mediaUrl} onopen={(i) => onopenMedia(media, i)} />
	</div>
	{#if canEdit}
		<form bind:this={deleteForm} method="POST" action={deleteAction} use:enhance class="hidden">
			<input type="hidden" name="updateId" value={update.id} />
		</form>
		<ConfirmDialog
			open={confirmDelete}
			message={t(locale, 'page.incident.confirmDeleteUpdate')}
			onconfirm={() => {
				confirmDelete = false;
				deleteForm?.requestSubmit();
			}}
			oncancel={() => (confirmDelete = false)}
		/>
	{/if}
</li>
