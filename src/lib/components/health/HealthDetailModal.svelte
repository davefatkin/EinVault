<script lang="ts" generics="D extends { id: string; title: string }">
	import type { Snippet } from 'svelte';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import ByLine from '#lib/components/ByLine.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Separator } from '#lib/components/ui/separator/index.js';
	import { enhance } from '$app/forms';
	import { X, FileText, HeartPulse, Unlink } from '@lucide/svelte';
	import LinkEventPicker from '#lib/components/incidents/LinkEventPicker.svelte';
	import { incidentPath } from '#lib/incidents.js';
	import { renderMarkdown } from '#lib/markdown.js';
	import { healthTypeLabel } from '#lib/i18n/labels.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import type { HealthDetail } from '#lib/health.js';

	// The shared health event / weight detail. The health page passes its
	// Edit/Delete actions as `footer`; journal surfaces pass `healthHref` for a
	// view-only modal that links to the Health Log, where editing happens.
	let {
		detail,
		documents = [],
		onclose,
		onPreviewDocument,
		healthHref = null,
		footer,
		footerExtra,
		journalHref,
		currentDate,
		incidentLinks
	}: {
		detail: HealthDetail;
		documents?: D[];
		onclose: () => void;
		onPreviewDocument?: (doc: D) => void;
		/** When set (and no footer), renders an "Open in Health Log" link. */
		healthHref?: string | null;
		/** Custom footer (e.g. Edit/Delete); overrides healthHref. */
		footer?: Snippet;
		/** Extra actions beside the "Open in Health Log" link; ignored when footer is set. */
		footerExtra?: Snippet;
		/** Builds the journal day URL for a date; the Journal list shows only when set. */
		journalHref?: (date: string) => string;
		/** The journal day being viewed, rendered as plain text instead of a link. */
		currentDate?: string;
		/** "About incident…": the incidents this event belongs to, with link/unlink. Owners only. */
		incidentLinks?: {
			companionId: string;
			incidents: { id: string; title: string; resolvedAt: Date | string | null }[];
			linkAction: string;
			unlinkAction: string;
		};
	} = $props();

	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);

	// Parents mount this only while open, so focusing on mount is enough.
	$effect(() => {
		dialogEl?.focus();
	});

	function handleWindowKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl || e.key !== 'Tab') return;
		const focusable = Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			)
		).filter((el) => !el.hasAttribute('disabled'));
		if (!focusable.length) return;
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	}

	// Candidates load when the picker opens, not with the page.
	let candidates = $state<
		| { id: string; title: string; resolvedAt: Date | string | null; occurredAt: Date | string }[]
		| null
	>(null);
	let candidatesState = $state<'idle' | 'loading' | 'failed'>('idle');
	async function openPicker(companionId: string, eventId: string) {
		candidatesState = 'loading';
		try {
			const res = await fetch(
				`/${companionId}/health/incidents/candidates?eventId=${encodeURIComponent(eventId)}`
			);
			if (!res.ok) throw new Error(String(res.status));
			candidates = await res.json();
			candidatesState = 'idle';
		} catch {
			candidatesState = 'failed';
		}
	}

	function preview(doc: D) {
		onclose();
		onPreviewDocument?.(doc);
	}
</script>

<svelte:window onkeydown={handleWindowKey} />

<div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
	<button
		tabindex="-1"
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		aria-label={t(locale, 'aria.closeDialog')}
		onclick={onclose}
	></button>
	<div
		bind:this={dialogEl}
		role="dialog"
		aria-modal="true"
		aria-labelledby="health-detail-title"
		tabindex="-1"
		onkeydown={trapFocus}
		class="relative z-10 w-full max-w-md rounded-xl border bg-card text-card-foreground shadow-xl focus:outline-none
			animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 sm:slide-in-from-bottom-0 duration-200"
	>
		<div class="flex items-center justify-between px-5 pt-5 pb-3">
			<h2 id="health-detail-title" class="font-semibold text-base text-foreground">
				{#if detail.kind === 'weight'}
					{t(locale, 'page.health.detailWeightEntry')}
				{:else if detail.kind === 'health'}
					{detail.title}
				{/if}
			</h2>
			<button
				onclick={onclose}
				aria-label={t(locale, 'aria.close')}
				class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
			>
				<X class="h-4 w-4" />
			</button>
		</div>

		<Separator />

		<div class="px-5 py-4 space-y-3 text-sm">
			{#if detail.kind === 'weight'}
				{@const w = detail}
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.health.detailWeight')}</span
					>
					<span class="text-xl font-bold text-foreground"
						>{w.weight}
						<span class="text-sm font-normal text-muted-foreground">{w.unit}</span></span
					>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.health.detailRecorded')}</span
					>
					<span class="text-foreground"
						><LocalTime date={w.at} format="datetime" /><ByLine
							user={w.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if w.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.health.detailNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(w.notes)}
						</div>
					</div>
				{/if}
			{:else if detail.kind === 'health'}
				{@const h = detail}
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.health.detailType')}</span
					>
					<Badge variant="teal" class="capitalize">{healthTypeLabel(locale, h.type)}</Badge>
				</div>
				<div class="flex items-center gap-3">
					<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
						>{t(locale, 'page.health.detailDate')}</span
					>
					<span class="text-foreground"
						><LocalTime date={h.at} format="datetime" /><ByLine
							user={h.logger}
							variant="inline"
						/></span
					>
				</div>
				{#if h.vetName || h.vetClinic}
					<div class="flex items-center gap-3">
						<span class="w-20 shrink-0 text-xs font-medium text-muted-foreground"
							>{t(locale, 'page.health.detailVet')}</span
						>
						<span class="text-foreground"
							>{[h.vetName, h.vetClinic].filter(Boolean).join(', ')}</span
						>
					</div>
				{/if}
				{#if h.notes}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'page.health.detailNotes')}
						</p>
						<div class="prose prose-sm dark:prose-invert max-w-none">
							{@html renderMarkdown(h.notes)}
						</div>
					</div>
				{/if}
				{#if documents.length > 0 && onPreviewDocument}
					<div class="pt-1">
						<p class="text-xs font-medium text-muted-foreground mb-1">
							{t(locale, 'nav.documents')}
						</p>
						<div class="flex flex-col gap-1.5">
							{#each documents as doc (doc.id)}
								<button
									type="button"
									onclick={() => preview(doc)}
									class="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
								>
									<FileText class="h-4 w-4 shrink-0 text-muted-foreground" />
									<span class="truncate">{doc.title}</span>
								</button>
							{/each}
						</div>
					</div>
				{/if}
				{#if h.journalDates?.length && journalHref}
					<div class="pt-1" data-testid="health-detail-journal">
						<p class="text-xs font-medium text-muted-foreground mb-1">{t(locale, 'nav.journal')}</p>
						<div class="flex flex-wrap gap-1.5">
							{#each h.journalDates as d (d)}
								{#if d === currentDate}
									<span
										class="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground"
										>{d}</span
									>
								{:else}
									<a
										href={journalHref(d)}
										onclick={onclose}
										class="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
										>{d}</a
									>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
				{#if incidentLinks}
					<div class="space-y-1.5 pt-1" data-testid="health-detail-incidents">
						<p class="text-xs font-medium text-muted-foreground">
							{t(locale, 'component.healthDetail.aboutIncident')}
						</p>
						{#each incidentLinks.incidents as inc (inc.id)}
							<div class="flex items-center gap-2">
								<a
									href={incidentPath(incidentLinks.companionId, inc.id)}
									onclick={onclose}
									class="min-w-0 flex-1 truncate text-primary-link hover:underline">{inc.title}</a
								>
								{#if inc.resolvedAt}
									<span class="text-xs text-muted-foreground"
										>{t(locale, 'component.healthDetail.incidentResolved')}</span
									>
								{/if}
								<form method="POST" action={incidentLinks.unlinkAction} use:enhance>
									<input type="hidden" name="incidentId" value={inc.id} />
									<input type="hidden" name="healthEventId" value={h.id} />
									<button
										type="submit"
										class="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
										aria-label={t(locale, 'component.healthDetail.unlinkIncident', {
											title: inc.title
										})}
									>
										<Unlink class="h-3.5 w-3.5" />
									</button>
								</form>
							</div>
						{/each}
						{#if candidates}
							<LinkEventPicker
								items={candidates.map((c) => ({
									id: c.id,
									label: c.title,
									badge: c.resolvedAt
										? t(locale, 'component.healthDetail.incidentResolved')
										: undefined,
									date: c.occurredAt
								}))}
								action={incidentLinks.linkAction}
								idField="incidentId"
								fields={{ healthEventId: h.id }}
								emptyText={t(locale, 'component.healthDetail.noIncidents')}
								onlinked={() => (candidates = null)}
							/>
						{:else}
							{#if candidatesState === 'failed'}
								<p role="alert" class="text-xs text-destructive">
									{t(locale, 'page.incident.linkLoadFailed')}
								</p>
							{/if}
							<Button
								variant="soft"
								size="sm"
								disabled={candidatesState === 'loading'}
								onclick={() => openPicker(incidentLinks.companionId, h.id)}
							>
								{t(locale, 'component.healthDetail.linkIncident')}
							</Button>
						{/if}
					</div>
				{/if}
			{/if}
		</div>

		{#if footer}
			<Separator />
			<div class="flex gap-2 px-5 py-4">{@render footer()}</div>
		{:else if healthHref}
			<Separator />
			<div class="flex flex-wrap items-start gap-2 px-5 py-4">
				<Button href={healthHref} variant="soft" size="sm" onclick={onclose}>
					<HeartPulse class="h-3.5 w-3.5 mr-1.5" />{t(
						locale,
						'component.healthDetail.openHealthLog'
					)}
				</Button>
				{@render footerExtra?.()}
			</div>
		{/if}
	</div>
</div>
