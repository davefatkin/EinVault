<script lang="ts">
	import { HeartPulse, Scale, FileText, Paperclip } from '@lucide/svelte';
	import { badgeVariants } from '$lib/components/ui/badge/index.js';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import { cn } from '$lib/utils';
	import { t, getLocale } from '$lib/i18n';
	import type { DayItem, DayItemDocument, DayRecordItem } from '$lib/dayItems';

	interface Props {
		item: DayItem;
		onOpenRecord: (item: DayRecordItem) => void;
		onPreviewDocument: (doc: DayItemDocument) => void;
	}

	let { item, onOpenRecord, onPreviewDocument }: Props = $props();
	const locale = getLocale();

	// Outline badge tokens keep health records visually apart from the gold
	// activity pills. The visible text starts the accessible name; the kind
	// and attachment count follow as visually hidden text.
	const chipClass = cn(
		badgeVariants({ variant: 'outline' }),
		'max-w-full gap-1 font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
	);
</script>

{#if item.kind === 'health'}
	<button
		type="button"
		class={chipClass}
		data-linked={item.fromLink ? 'true' : undefined}
		onclick={() => onOpenRecord(item)}
	>
		<HeartPulse class="h-3 w-3 shrink-0" aria-hidden="true" />
		<span class="max-w-48 truncate"
			>{item.title}{#if item.fromLink}&nbsp;· <LocalTime date={item.at} format="date" />{/if}</span
		>
		<span class="sr-only">, {t(locale, 'page.journal.dayItem.health')}</span>
		{#if item.fromLink}<span class="sr-only">, {t(locale, 'page.journal.dayItem.linked')}</span
			>{/if}
		{#if item.documents.length > 0}
			<span
				class="inline-flex shrink-0 items-center gap-0.5 text-muted-foreground"
				aria-hidden="true"
			>
				<Paperclip class="h-3 w-3" />{item.documents.length}
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
	<button type="button" class={chipClass} onclick={() => onOpenRecord(item)}>
		<Scale class="h-3 w-3 shrink-0" aria-hidden="true" />
		<span>{item.weight} {item.unit}</span>
		<span class="sr-only">, {t(locale, 'page.journal.dayItem.weight')}</span>
	</button>
{:else}
	<button type="button" class={chipClass} onclick={() => onPreviewDocument(item)}>
		<FileText class="h-3 w-3 shrink-0" aria-hidden="true" />
		<span class="max-w-48 truncate"
			>{item.title}{#if item.eventTitle}&nbsp;· {item.eventTitle}{/if}</span
		>
		<span class="sr-only">, {t(locale, 'page.journal.dayItem.document')}</span>
	</button>
{/if}
