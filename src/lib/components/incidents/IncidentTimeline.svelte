<script lang="ts">
	import { CircleCheck, FileText } from '@lucide/svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import IncidentUpdateItem from './IncidentUpdateItem.svelte';
	import { renderMarkdown } from '#lib/markdown.js';
	import { healthTypeLabel } from '#lib/i18n/labels.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { DocRef, IncidentCaps, TimelineItem } from '#lib/incidents.js';
	import type { MediaItem } from '#lib/media.js';

	// The incident's story in occurredAt order: updates, linked health events
	// (with their documents when the viewer may see them), and the resolution.
	let {
		items,
		companionId,
		incidentId,
		caps,
		canModifyMedia,
		allowTime,
		editAction,
		deleteAction,
		mediaUrl,
		uploadMaxMb,
		videoMaxMb,
		onopenMedia,
		onpreviewDoc
	}: {
		items: TimelineItem[];
		companionId: string;
		incidentId: string;
		caps: IncidentCaps;
		canModifyMedia: (item: MediaItem) => boolean;
		allowTime: boolean;
		editAction: string;
		deleteAction: string;
		mediaUrl: (item: MediaItem) => string;
		uploadMaxMb: number;
		videoMaxMb: number;
		onopenMedia: (items: MediaItem[], index: number) => void;
		onpreviewDoc: (doc: DocRef) => void;
	} = $props();
	const locale = getLocale();

	const key = (item: TimelineItem) =>
		item.kind === 'update'
			? `u-${item.update.id}`
			: item.kind === 'event'
				? `e-${item.event.id}`
				: 'resolved';
</script>

{#if items.length === 0}
	<p class="text-sm text-muted-foreground">{t(locale, 'page.incident.noUpdates')}</p>
{:else}
	<ol class="ml-1.5 space-y-5 border-l-2 border-border pl-5">
		{#each items as item (key(item))}
			{#if item.kind === 'update'}
				<IncidentUpdateItem
					update={item.update}
					{companionId}
					{incidentId}
					canEdit={caps.canEditUpdate(item.update)}
					{canModifyMedia}
					{allowTime}
					{editAction}
					{deleteAction}
					{mediaUrl}
					{uploadMaxMb}
					{videoMaxMb}
					{onopenMedia}
				/>
			{:else if item.kind === 'event'}
				<li class="incident-tl-item relative space-y-1">
					<span
						class="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background"
						aria-hidden="true"
					></span>
					<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
						<Badge variant="primary">{healthTypeLabel(locale, item.event.type)}</Badge>
						<span class="text-sm font-medium text-foreground">{item.event.title}</span>
						<span class="text-xs text-muted-foreground"
							><LocalTime date={item.event.occurredAt} /></span
						>
					</div>
					{#if item.event.vetName || item.event.vetClinic}
						<p class="text-xs text-muted-foreground">
							{[item.event.vetName, item.event.vetClinic].filter(Boolean).join(' · ')}
						</p>
					{/if}
					{#if item.event.notes}
						<div
							class="prose prose-sm dark:prose-invert max-w-none break-words text-muted-foreground"
						>
							{@html renderMarkdown(item.event.notes)}
						</div>
					{/if}
					{#if item.documents.length > 0}
						<div class="flex flex-wrap gap-x-3 gap-y-1">
							{#each item.documents as doc (doc.id)}
								<button
									type="button"
									class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
									onclick={() => onpreviewDoc(doc)}
								>
									<FileText class="h-3 w-3" />{doc.title}
								</button>
							{/each}
						</div>
					{/if}
				</li>
			{:else}
				<li class="incident-tl-item relative flex items-center gap-2 text-sm">
					<span
						class="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-teal ring-4 ring-background"
						aria-hidden="true"
					></span>
					<CircleCheck class="h-4 w-4 text-teal" />
					<span class="font-medium text-foreground">{t(locale, 'page.incident.resolvedItem')}</span>
					<span class="text-xs text-muted-foreground"
						><LocalTime date={item.at} format="datetime" /></span
					>
				</li>
			{/if}
		{/each}
	</ol>
{/if}
