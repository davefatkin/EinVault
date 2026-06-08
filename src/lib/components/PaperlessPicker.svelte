<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';
	import { X, FileText, Loader2 } from '@lucide/svelte';

	interface PaperlessDoc {
		id: number;
		title: string;
		created: string | null;
		archiveSerialNumber: string | null;
	}

	interface Props {
		open: boolean;
		onpick: (paperlessId: number) => void | Promise<void>;
		onclose: () => void;
	}

	let { open, onpick, onclose }: Props = $props();
	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	let docs = $state<PaperlessDoc[]>([]);
	let query = $state('');
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');
	let page = $state(1);
	let hasNextPage = $state(false);
	let tagScoped = $state(false);
	let selecting = $state<number | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	const PAGE_SIZE = 60;

	async function loadPage(nextPage: number, append = false) {
		if (append) loadingMore = true;
		else loading = true;
		error = '';
		try {
			let qs = `page=${nextPage}&pageSize=${PAGE_SIZE}`;
			if (query.trim()) qs += `&query=${encodeURIComponent(query.trim())}`;
			const res = await fetch(`/api/paperless/documents?${qs}`);
			if (!res.ok) {
				error = t(locale, 'paperless.picker.loadError');
				return;
			}
			const data = (await res.json()) as {
				items: PaperlessDoc[];
				hasNextPage: boolean;
				tagScoped: boolean;
			};
			docs = append ? [...docs, ...data.items] : data.items;
			hasNextPage = data.hasNextPage;
			tagScoped = data.tagScoped;
			page = nextPage;
		} catch {
			error = t(locale, 'paperless.picker.loadError');
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function onQueryInput(e: Event) {
		query = (e.currentTarget as HTMLInputElement).value;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => loadPage(1, false), 300);
	}

	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			docs = [];
			query = '';
			page = 1;
			hasNextPage = false;
			error = '';
			selecting = null;
			loadPage(1, false);
			tick().then(() => dialogEl?.focus());
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});

	$effect(() => () => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onclose();
	}

	async function handleScroll(e: Event) {
		const el = e.currentTarget as HTMLElement;
		if (loadingMore || !hasNextPage) return;
		if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
			await loadPage(page + 1, true);
		}
	}

	async function pick(id: number) {
		if (selecting !== null) return;
		selecting = id;
		try {
			await onpick(id);
		} finally {
			selecting = null;
		}
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
			class="absolute inset-0 bg-black/50"
			onclick={onclose}
			onkeydown={() => {}}
		></div>

		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-label={t(locale, 'paperless.picker.title')}
			tabindex="-1"
			class="relative z-10 w-full max-w-3xl max-h-[85vh] rounded-lg border border-border bg-card shadow-lg flex flex-col"
		>
			<div class="flex items-center justify-between gap-3 px-5 py-3 border-b border-border">
				<div class="min-w-0">
					<h2 class="font-semibold text-foreground">{t(locale, 'paperless.picker.title')}</h2>
					{#if tagScoped}
						<p class="text-xs text-muted-foreground mt-0.5">
							{t(locale, 'paperless.picker.tagScoped')}
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="rounded-md p-1 hover:bg-accent text-muted-foreground"
					aria-label={t(locale, 'paperless.picker.close')}
					onclick={onclose}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="px-5 py-2 border-b border-border">
				<Input
					type="search"
					placeholder={t(locale, 'paperless.picker.searchPlaceholder')}
					value={query}
					oninput={onQueryInput}
				/>
			</div>

			<div class="flex-1 overflow-y-auto p-4" onscroll={handleScroll}>
				{#if error}
					<div
						role="alert"
						class="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-300 mb-3"
					>
						{error}
					</div>
				{/if}

				{#if loading}
					<div class="flex items-center justify-center py-16 text-muted-foreground">
						<Loader2 class="h-6 w-6 animate-spin" />
					</div>
				{:else if docs.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
						<FileText class="h-10 w-10 mb-3" />
						<p class="text-sm">{t(locale, 'paperless.picker.empty')}</p>
					</div>
				{:else}
					<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{#each docs as doc (doc.id)}
							<button
								type="button"
								class="flex flex-col overflow-hidden rounded-md border border-border bg-stone-50 dark:bg-stone-900 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-wait text-left"
								onclick={() => pick(doc.id)}
								disabled={selecting === doc.id}
								title={doc.title}
							>
								<div class="relative aspect-[3/4] bg-stone-100 dark:bg-stone-800">
									<img
										src={`/api/paperless/thumb/${doc.id}`}
										alt={doc.title}
										class="w-full h-full object-cover"
										loading="lazy"
									/>
									{#if selecting === doc.id}
										<div class="absolute inset-0 flex items-center justify-center bg-black/40">
											<Loader2 class="h-5 w-5 animate-spin text-white" />
										</div>
									{/if}
								</div>
								<div class="px-2 py-1.5">
									<p class="text-xs font-medium text-foreground truncate">{doc.title}</p>
									{#if doc.created}
										<p class="text-[11px] text-muted-foreground">{doc.created.slice(0, 10)}</p>
									{/if}
								</div>
							</button>
						{/each}
					</div>

					{#if loadingMore}
						<div class="flex items-center justify-center py-4 text-muted-foreground">
							<Loader2 class="h-4 w-4 animate-spin" />
						</div>
					{/if}
				{/if}
			</div>

			<div class="flex justify-end gap-2 px-5 py-3 border-t border-border">
				<Button variant="outline" size="sm" onclick={onclose}>
					{t(locale, 'paperless.picker.cancel')}
				</Button>
			</div>
		</div>
	</div>
{/if}
