<script lang="ts">
	import { HeartPulse, Scale, FileText, Paperclip } from '@lucide/svelte';
	import type { Snippet } from 'svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeLabel, documentCategoryLabel } from '$lib/i18n/labels';
	import type { DayItem, DayItemDocument, DayRecordItem } from '$lib/dayItems';

	interface Props {
		items: DayItem[];
		onOpenRecord: (item: DayRecordItem) => void;
		onPreviewDocument: (doc: DayItemDocument) => void;
		/** Rendered right of the title, e.g. the "Link health event" button. */
		headerAction?: Snippet;
		/** An open form, rendered above the list. Hides the empty state. */
		panel?: Snippet;
	}

	let { items, onOpenRecord, onPreviewDocument, headerAction, panel }: Props = $props();
	const locale = getLocale();

	// One action per row. A health event's attached documents open from its
	// detail modal; the row shows their count, like the timeline chip.
	const rowClass =
		'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent';
</script>

<div class="space-y-2" data-testid="day-health-records">
	<div class="flex items-center justify-between">
		<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
			{t(locale, 'page.journal.day.healthRecords')}
		</p>
		{#if headerAction}{@render headerAction()}{/if}
	</div>
	{#if panel}{@render panel()}{/if}
	{#if items.length === 0 && !panel}
		<EmptyState tint="teal" title={t(locale, 'page.journal.day.noHealthRecords')}>
			{#snippet icon()}<HeartPulse class="h-5 w-5" />{/snippet}
		</EmptyState>
	{:else if items.length > 0}
		<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
			{#each items as item (`${item.kind}:${item.id}`)}
				<li>
					{#if item.kind === 'health'}
						<button
							type="button"
							class={rowClass}
							data-linked={item.fromLink ? 'true' : undefined}
							onclick={() => onOpenRecord(item)}
						>
							<HeartPulse class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-foreground">{item.title}</span>
								<span class="block text-xs text-muted-foreground"
									>{healthTypeLabel(locale, item.type)} · <LocalTime
										date={item.at}
										format={item.fromLink ? 'datetime' : 'time'}
									/></span
								>
							</span>
							{#if item.documents.length > 0}
								<span
									class="inline-flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground"
									aria-hidden="true"
								>
									<Paperclip class="h-3.5 w-3.5" />{item.documents.length}
								</span>
								<span class="sr-only"
									>, {t(
										locale,
										item.documents.length === 1
											? 'page.journal.dayItem.attachments.one'
											: 'page.journal.dayItem.attachments.other',
										{ count: item.documents.length }
									)}</span
								>
							{/if}
						</button>
					{:else if item.kind === 'weight'}
						<button type="button" class={rowClass} onclick={() => onOpenRecord(item)}>
							<Scale class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-foreground"
									>{item.weight} {item.unit}</span
								>
								<span class="block text-xs text-muted-foreground"
									><LocalTime date={item.at} format="time" /></span
								>
							</span>
						</button>
					{:else}
						<button type="button" class={rowClass} onclick={() => onPreviewDocument(item)}>
							<FileText class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium text-foreground">{item.title}</span>
								<span class="block truncate text-xs text-muted-foreground"
									>{documentCategoryLabel(locale, item.category)}{#if item.eventTitle}&nbsp;· {item.eventTitle}{/if}</span
								>
							</span>
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
