<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, getLocale } from '$lib/i18n';
	import { Search } from '@lucide/svelte';

	export type SearchEntityType =
		| 'journal'
		| 'health'
		| 'reminder'
		| 'document'
		| 'daily'
		| 'weight';

	export interface ClientSearchResult {
		type: SearchEntityType;
		id: string;
		companionId: string;
		companionName: string;
		title: string;
		snippet: string;
		date: string;
		href: string;
	}

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	let query = $state('');
	let results = $state<ClientSearchResult[]>([]);
	let selectedIndex = $state(-1);
	let loading = $state(false);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let currentController: AbortController | undefined;

	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			query = '';
			results = [];
			selectedIndex = -1;
			loading = false;
			tick().then(() => inputEl?.focus());
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});

	$effect(() => {
		// Reactive to query changes
		const q = query;

		clearTimeout(debounceTimer);
		currentController?.abort();

		if (q.trim().length < 2) {
			results = [];
			selectedIndex = -1;
			loading = false;
			return;
		}

		loading = true;
		const controller = new AbortController();
		currentController = controller;

		debounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
					signal: controller.signal
				});
				if (!res.ok) {
					results = [];
					return;
				}
				const data = (await res.json()) as { results: ClientSearchResult[] };
				results = data.results;
				selectedIndex = -1;
			} catch (err) {
				if ((err as Error).name !== 'AbortError') {
					results = [];
				}
			} finally {
				if (!controller.signal.aborted) {
					loading = false;
				}
			}
		}, 200);

		return () => {
			clearTimeout(debounceTimer);
			controller.abort();
		};
	});

	function close() {
		open = false;
	}

	function splitOnce(str: string, sep: string): [string, string] {
		const idx = str.indexOf(sep);
		if (idx === -1) return [str, ''];
		return [str.slice(0, idx), str.slice(idx + sep.length)];
	}

	type GroupKey = SearchEntityType;

	const GROUP_ORDER: GroupKey[] = ['journal', 'daily', 'health', 'weight', 'reminder', 'document'];

	let groups = $derived(
		(() => {
			const map = new Map<GroupKey, ClientSearchResult[]>();
			for (const r of results) {
				if (!map.has(r.type)) map.set(r.type, []);
				map.get(r.type)!.push(r);
			}
			return GROUP_ORDER.filter((k) => map.has(k)).map((k) => ({ type: k, items: map.get(k)! }));
		})()
	);

	// Flat ordered list for keyboard navigation
	let flatResults = $derived(
		groups.flatMap((g: { type: GroupKey; items: ClientSearchResult[] }) => g.items)
	);

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
			return;
		}

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIndex = Math.min(selectedIndex + 1, flatResults.length - 1);
			scrollOptionIntoView();
			return;
		}

		if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIndex = Math.max(selectedIndex - 1, -1);
			scrollOptionIntoView();
			return;
		}

		if (e.key === 'Enter' && selectedIndex >= 0 && flatResults[selectedIndex]) {
			e.preventDefault();
			goto(flatResults[selectedIndex].href);
			close();
			return;
		}

		// Tab trap
		if (e.key === 'Tab') {
			if (!dialogEl) return;
			const focusable = Array.from(
				dialogEl.querySelectorAll<HTMLElement>(
					'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
				)
			);
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey) {
				if (document.activeElement === first) {
					e.preventDefault();
					last?.focus();
				}
			} else {
				if (document.activeElement === last) {
					e.preventDefault();
					first?.focus();
				}
			}
		}
	}

	function scrollOptionIntoView() {
		tick().then(() => {
			if (selectedIndex < 0) return;
			const el = dialogEl?.querySelector(`#search-option-${selectedIndex}`);
			el?.scrollIntoView({ block: 'nearest' });
		});
	}

	function groupLabel(type: GroupKey): string {
		const keyMap: Record<GroupKey, Parameters<typeof t>[1]> = {
			journal: 'search.group.journal',
			health: 'search.group.health',
			reminder: 'search.group.reminder',
			document: 'search.group.document',
			daily: 'search.group.daily',
			weight: 'search.group.weight'
		};
		return t(locale, keyMap[type]);
	}

	function flatIndex(groupIdx: number, itemIdx: number): number {
		let idx = 0;
		for (let g = 0; g < groupIdx; g++) {
			idx += groups[g].items.length;
		}
		return idx + itemIdx;
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 pb-4"
		role="presentation"
		onkeydown={handleKeydown}
	>
		<!-- Backdrop -->
		<div
			role="presentation"
			class="absolute inset-0 bg-black/50"
			onclick={close}
			onkeydown={() => {}}
		></div>

		<!-- Dialog -->
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-label={t(locale, 'aria.searchResults')}
			tabindex="-1"
			class="relative z-10 w-full max-w-xl rounded-lg border border-border bg-card shadow-xl flex flex-col overflow-hidden"
		>
			<!-- Input -->
			<div class="flex items-center gap-2 px-4 py-3 border-b border-border">
				<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="search"
					role="combobox"
					aria-expanded={results.length > 0}
					aria-controls="search-results"
					aria-activedescendant={selectedIndex >= 0 ? `search-option-${selectedIndex}` : undefined}
					autocomplete="off"
					placeholder={t(locale, 'search.placeholder')}
					class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
			</div>

			<!-- Results area -->
			<div class="max-h-[60vh] overflow-y-auto">
				{#if query.trim().length < 2}
					<p class="px-4 py-6 text-center text-sm text-muted-foreground">
						{t(locale, 'search.hint')}
					</p>
				{:else if loading}
					<p class="px-4 py-6 text-center text-sm text-muted-foreground">
						{t(locale, 'common.loading')}
					</p>
				{:else if results.length === 0}
					<p class="px-4 py-6 text-center text-sm text-muted-foreground">
						{t(locale, 'search.noResults')}
					</p>
				{:else}
					<ul
						id="search-results"
						role="listbox"
						aria-label={t(locale, 'aria.searchResults')}
						class="py-2"
					>
						{#each groups as group, gi (group.type)}
							<li role="presentation">
								<p
									class="px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
								>
									{groupLabel(group.type)}
								</p>
								<ul role="presentation">
									{#each group.items as item, ii (item.id)}
										{@const fi = flatIndex(gi, ii)}
										{@const isSelected = fi === selectedIndex}
										<li
											id="search-option-{fi}"
											role="option"
											aria-selected={isSelected}
											onclick={() => {
												goto(item.href);
												close();
											}}
											onkeydown={(e) => {
												if (e.key === 'Enter' || e.key === ' ') {
													e.preventDefault();
													goto(item.href);
													close();
												}
											}}
											tabindex="-1"
											class="flex items-start gap-3 px-4 py-2 cursor-pointer text-sm transition-colors {isSelected
												? 'bg-accent text-accent-foreground'
												: 'hover:bg-accent/50'}"
										>
											<div class="flex-1 min-w-0">
												<!-- Title or snippet -->
												{#if item.title && item.title.trim().length > 0}
													<p class="font-medium truncate text-foreground">{item.title}</p>
												{/if}
												{#if item.snippet && item.snippet.trim().length > 0}
													<p class="text-xs text-muted-foreground mt-0.5 line-clamp-2">
														{#each item.snippet.split('\x01') as part, i}
															{#if i === 0}{part}{:else}{@const [marked, rest] = splitOnce(
																	part,
																	'\x02'
																)}<mark
																	class="bg-yellow-200 dark:bg-yellow-800 text-foreground rounded-sm px-0.5"
																	>{marked}</mark
																>{rest}{/if}
														{/each}
													</p>
												{/if}
											</div>
											<div class="flex flex-col items-end gap-1 shrink-0">
												<span
													class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary"
												>
													{item.companionName}
												</span>
												{#if item.date}
													<span class="text-xs text-muted-foreground">{item.date}</span>
												{/if}
											</div>
										</li>
									{/each}
								</ul>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	</div>
{/if}
