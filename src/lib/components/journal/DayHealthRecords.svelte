<script lang="ts">
	import { HeartPulse, Scale, FileText } from '@lucide/svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeLabel, documentCategoryLabel } from '$lib/i18n/labels';
	import type { DayItem, DayItemDocument, DayRecordItem } from '$lib/dayItems';

	interface Props {
		items: DayItem[];
		onOpenRecord: (item: DayRecordItem) => void;
		onPreviewDocument: (doc: DayItemDocument) => void;
	}

	let { items, onOpenRecord, onPreviewDocument }: Props = $props();
	const locale = getLocale();

	// The row (li) owns the hover, so a health event and its attached documents
	// highlight as one card. The event button's after: overlay makes the whole
	// row open the event; document buttons sit above it.
	const rowClass = 'flex w-full items-center gap-3 px-4 py-3 text-left';
</script>

<div class="space-y-2" data-testid="day-health-records">
	<p class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
		{t(locale, 'page.journal.day.healthRecords')}
	</p>
	<ul class="divide-y divide-border overflow-hidden rounded-lg border border-border">
		{#each items as item (`${item.kind}:${item.id}`)}
			<li class="relative transition-colors hover:bg-accent">
				{#if item.kind === 'health'}
					<button
						type="button"
						class="{rowClass} after:absolute after:inset-0"
						onclick={() => onOpenRecord(item)}
					>
						<HeartPulse class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						<span class="min-w-0 flex-1">
							<span class="block truncate text-sm font-medium text-foreground">{item.title}</span>
							<span class="block text-xs text-muted-foreground"
								>{healthTypeLabel(locale, item.type)} · <LocalTime
									date={item.at}
									format="time"
								/></span
							>
						</span>
					</button>
					{#if item.documents.length > 0}
						<ul class="-mt-1 space-y-1 pb-3 pl-11 pr-4">
							{#each item.documents as doc (doc.id)}
								<li>
									<button
										type="button"
										class="relative z-10 flex max-w-full items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
										onclick={() => onPreviewDocument(doc)}
									>
										<FileText class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
										<span class="truncate">{doc.title}</span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
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
</div>
