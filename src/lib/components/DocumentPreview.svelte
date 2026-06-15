<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';
	import { X, ChevronLeft, ChevronRight, Download, Loader2 } from '@lucide/svelte';

	interface Props {
		open: boolean;
		url: string;
		mimeType: string;
		title: string;
		onclose: () => void;
	}

	let { open, url, mimeType, title, onclose }: Props = $props();
	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let loading = $state(false);
	let failed = $state(false);
	let pageNum = $state(1);
	let pageCount = $state(0);
	// pdfjs PDFDocumentProxy; typed loosely to keep the lazy import simple.
	let pdfDoc = $state<any>(null);
	let renderTask: { cancel: () => void } | null = null;

	const isPdf = $derived(mimeType === 'application/pdf');

	async function loadPdf() {
		loading = true;
		failed = false;
		pdfDoc = null;
		pageNum = 1;
		pageCount = 0;
		try {
			const pdfjs = await import('pdfjs-dist');
			const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
			// isEvalSupported: false — pdf.js parses attacker-supplied bytes in
			// our origin; eval paths were the vector for CVE-2024-4367. The flag
			// is honored at runtime but dropped from v6's published types, so the
			// param object is asserted to the getDocument signature.
			const task = pdfjs.getDocument({
				url,
				isEvalSupported: false
			} as Parameters<typeof pdfjs.getDocument>[0]);
			pdfDoc = await task.promise;
			pageCount = pdfDoc.numPages;
			// Flip loading BEFORE rendering: the canvas only mounts in the
			// !loading branch, and renderPage awaits tick() to find it.
			loading = false;
			await renderPage(1);
		} catch (err) {
			console.error('[document-preview]', err);
			failed = true;
			loading = false;
		}
	}

	async function renderPage(n: number) {
		if (!pdfDoc) return;
		await tick(); // canvas mounts after loading flips
		if (!canvasEl) return;
		renderTask?.cancel();
		const page = await pdfDoc.getPage(n);
		const containerWidth = Math.min(900, dialogEl?.clientWidth ?? 900) - 48;
		const baseViewport = page.getViewport({ scale: 1 });
		const scale = (containerWidth / baseViewport.width) * (window.devicePixelRatio || 1);
		const viewport = page.getViewport({ scale });
		canvasEl.width = viewport.width;
		canvasEl.height = viewport.height;
		canvasEl.style.width = `${viewport.width / (window.devicePixelRatio || 1)}px`;
		const ctx = canvasEl.getContext('2d')!;
		const task = page.render({ canvasContext: ctx, viewport });
		renderTask = task;
		await task.promise.catch(() => {});
		pageNum = n;
	}

	// Track only `open`/`isPdf` in the effect body. Cleanup runs on close/unmount.
	$effect(() => {
		if (!open) {
			tick().then(() => triggerEl?.focus());
			return;
		}
		triggerEl = document.activeElement as HTMLElement | null;
		if (isPdf) loadPdf();
		tick().then(() => dialogEl?.focus());
		return () => {
			renderTask?.cancel();
			pdfDoc?.destroy?.();
			pdfDoc = null;
		};
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
		if (isPdf && e.key === 'ArrowRight' && pageNum < pageCount) renderPage(pageNum + 1);
		if (isPdf && e.key === 'ArrowLeft' && pageNum > 1) renderPage(pageNum - 1);
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="presentation"
		onkeydown={handleKeydown}
	>
		<div
			role="presentation"
			class="absolute inset-0 bg-black/60"
			onclick={onclose}
			onkeydown={() => {}}
		></div>

		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-label={title}
			tabindex="-1"
			class="relative z-10 w-full max-w-[920px] max-h-[90vh] rounded-lg border border-border bg-card shadow-lg flex flex-col"
		>
			<div class="flex items-center justify-between gap-2 px-5 py-3 border-b border-border">
				<h2 class="font-semibold text-foreground truncate">{title}</h2>
				<div class="flex items-center gap-1 shrink-0">
					<a
						href={`${url}?download`}
						class="rounded-md p-1.5 hover:bg-accent text-muted-foreground"
						aria-label={t(locale, 'page.documents.download')}
					>
						<Download class="h-4 w-4" />
					</a>
					<button
						type="button"
						class="rounded-md p-1.5 hover:bg-accent text-muted-foreground"
						aria-label={t(locale, 'paperless.picker.close')}
						onclick={onclose}
					>
						<X class="h-4 w-4" />
					</button>
				</div>
			</div>

			<div class="flex-1 overflow-auto p-4 flex items-start justify-center">
				{#if isPdf}
					{#if loading}
						<div class="flex items-center gap-2 py-16 text-muted-foreground">
							<Loader2 class="h-5 w-5 animate-spin" />
							<span class="text-sm">{t(locale, 'page.documents.previewLoading')}</span>
						</div>
					{:else if failed}
						<p class="py-16 text-sm text-muted-foreground">
							{t(locale, 'page.documents.previewFailed')}
						</p>
					{:else}
						<canvas bind:this={canvasEl} class="rounded shadow max-w-full"></canvas>
					{/if}
				{:else}
					<img src={url} alt={title} class="max-w-full max-h-[75vh] rounded shadow" />
				{/if}
			</div>

			{#if isPdf && pageCount > 1}
				<div class="flex items-center justify-center gap-3 px-5 py-2.5 border-t border-border">
					<Button
						variant="soft"
						size="sm"
						disabled={pageNum <= 1}
						onclick={() => renderPage(pageNum - 1)}
						aria-label={t(locale, 'aria.previousPage')}
					>
						<ChevronLeft class="h-4 w-4" />
					</Button>
					<span class="text-sm text-muted-foreground">
						{t(locale, 'page.documents.pageOf', { page: pageNum, total: pageCount })}
					</span>
					<Button
						variant="soft"
						size="sm"
						disabled={pageNum >= pageCount}
						onclick={() => renderPage(pageNum + 1)}
						aria-label={t(locale, 'aria.nextPage')}
					>
						<ChevronRight class="h-4 w-4" />
					</Button>
				</div>
			{/if}
		</div>
	</div>
{/if}
