<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';
	import { X, ImageIcon, Loader2 } from '@lucide/svelte';

	interface ImmichAsset {
		id: string;
		originalFileName: string;
		originalMimeType: string;
		fileSizeInByte: number | null;
		createdAt: string | null;
		type: string;
	}

	interface Props {
		open: boolean;
		onpick: (assetId: string) => void | Promise<void>;
		onclose: () => void;
	}

	let { open, onpick, onclose }: Props = $props();
	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	let assets = $state<ImmichAsset[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');
	let page = $state(1);
	let hasNextPage = $state(false);
	let albumScoped = $state(false);
	let selecting = $state<string | null>(null);

	const PAGE_SIZE = 60;

	async function loadPage(nextPage: number, append = false) {
		const flag = append ? 'loadingMore' : 'loading';
		if (flag === 'loading') loading = true;
		else loadingMore = true;
		error = '';
		try {
			const res = await fetch(`/api/immich/assets?page=${nextPage}&pageSize=${PAGE_SIZE}`);
			if (!res.ok) {
				error = t(locale, 'immich.picker.loadError');
				return;
			}
			const data = (await res.json()) as {
				items: ImmichAsset[];
				hasNextPage: boolean;
				albumScoped: boolean;
			};
			if (append) {
				assets = [...assets, ...data.items];
			} else {
				assets = data.items;
			}
			hasNextPage = data.hasNextPage;
			albumScoped = data.albumScoped;
			page = nextPage;
		} catch {
			error = t(locale, 'immich.picker.loadError');
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	// Opening the picker always starts from page 1: simpler than persisting
	// scroll/state across opens, and homelab Immich responds fast enough that
	// re-fetching the first page is unnoticeable.
	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			assets = [];
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

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onclose();
		}
	}

	async function handleScroll(e: Event) {
		const el = e.currentTarget as HTMLElement;
		if (loadingMore || !hasNextPage) return;
		if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
			await loadPage(page + 1, true);
		}
	}

	async function pick(assetId: string) {
		if (selecting) return;
		selecting = assetId;
		try {
			await onpick(assetId);
		} finally {
			// If parent closed the picker, $effect on `open` already resets
			// `selecting` on next open. If parent kept the picker open (e.g.
			// after a failed pick), clear here so the user can try another.
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
			aria-label={t(locale, 'immich.picker.title')}
			tabindex="-1"
			class="relative z-10 w-full max-w-3xl max-h-[85vh] rounded-lg border border-border bg-card shadow-lg flex flex-col"
		>
			<div class="flex items-center justify-between px-5 py-3 border-b border-border">
				<div>
					<h2 class="font-semibold text-foreground">
						{t(locale, 'immich.picker.title')}
					</h2>
					{#if albumScoped}
						<p class="text-xs text-muted-foreground mt-0.5">
							{t(locale, 'immich.picker.albumScoped')}
						</p>
					{/if}
				</div>
				<button
					type="button"
					class="rounded-md p-1 hover:bg-accent text-muted-foreground"
					aria-label={t(locale, 'immich.picker.close')}
					onclick={onclose}
				>
					<X class="h-4 w-4" />
				</button>
			</div>

			<div class="flex-1 overflow-y-auto p-4" onscroll={handleScroll}>
				{#if error}
					<div
						class="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-300 mb-3"
					>
						{error}
					</div>
				{/if}

				{#if loading}
					<div class="flex items-center justify-center py-16 text-muted-foreground">
						<Loader2 class="h-6 w-6 animate-spin" />
					</div>
				{:else if assets.length === 0}
					<div class="flex flex-col items-center justify-center py-16 text-muted-foreground">
						<ImageIcon class="h-10 w-10 mb-3" />
						<p class="text-sm">{t(locale, 'immich.picker.empty')}</p>
					</div>
				{:else}
					<div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
						{#each assets as asset (asset.id)}
							<button
								type="button"
								class="relative aspect-square overflow-hidden rounded-md bg-stone-100 dark:bg-stone-800 transition-opacity hover:opacity-80 disabled:opacity-50 disabled:cursor-wait"
								onclick={() => pick(asset.id)}
								disabled={selecting === asset.id}
								title={asset.originalFileName}
							>
								<img
									src={`/api/immich/thumbnail/${asset.id}?size=thumbnail`}
									alt={asset.originalFileName}
									class="w-full h-full object-cover"
									loading="lazy"
								/>
								{#if selecting === asset.id}
									<div class="absolute inset-0 flex items-center justify-center bg-black/40">
										<Loader2 class="h-5 w-5 animate-spin text-white" />
									</div>
								{/if}
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
					{t(locale, 'immich.picker.cancel')}
				</Button>
			</div>
		</div>
	</div>
{/if}
