<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { t, getLocale } from '$lib/i18n';
	import { Search, X } from '@lucide/svelte';
	import { parseSigilToken, stripSigilToken } from '$lib/searchSigil';

	export type SearchEntityType =
		| 'journal'
		| 'health'
		| 'reminder'
		| 'document'
		| 'daily'
		| 'weight'
		| 'media';

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

	const ENTITY_TYPES: SearchEntityType[] = [
		'journal',
		'daily',
		'health',
		'weight',
		'reminder',
		'document',
		'media'
	];

	let {
		open = $bindable(false),
		companions = []
	}: {
		open?: boolean;
		companions?: { id: string; name: string }[];
	} = $props();

	const locale = getLocale();

	// Build the type list (label derived from existing search.group.* keys)
	const typeList = ENTITY_TYPES.map((value) => ({
		value,
		label: t(locale, `search.group.${value}` as Parameters<typeof t>[1])
	}));

	let dialogEl = $state<HTMLElement | null>(null);
	let inputEl = $state<HTMLInputElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);

	let query = $state('');
	let results = $state<ClientSearchResult[]>([]);
	let selectedIndex = $state(-1);
	let loading = $state(false);

	// Filter state
	let companionFilters = $state<{ id: string; name: string }[]>([]);
	let typeFilters = $state<SearchEntityType[]>([]);
	let after = $state('');
	let before = $state('');

	// Sigil autocomplete state
	let autocompleteOpen = $state(false);
	let sigilSelected = $state(0);
	let sigilItems = $state<{ label: string; value: string; id?: string }[]>([]);

	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let currentController: AbortController | undefined;

	// True when any filter is active (even without query text)
	function hasFilters(): boolean {
		return companionFilters.length > 0 || typeFilters.length > 0 || !!after || !!before;
	}

	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			query = '';
			results = [];
			selectedIndex = -1;
			loading = false;
			companionFilters = [];
			typeFilters = [];
			after = '';
			before = '';
			autocompleteOpen = false;
			sigilItems = [];
			sigilSelected = 0;
			tick().then(() => inputEl?.focus());
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});

	$effect(() => {
		// Reactive to query changes — sigil detection
		const tok = parseSigilToken(query);
		if (tok) {
			const partial = tok.partial.toLowerCase();
			if (tok.sigil === '@') {
				const filtered = companions
					.filter((c) => !companionFilters.some((f) => f.id === c.id))
					.filter((c) => c.name.toLowerCase().includes(partial));
				sigilItems = filtered.map((c) => ({ label: c.name, value: c.id, id: c.id }));
			} else {
				// '#'
				const filtered = typeList.filter(
					(t) =>
						!typeFilters.includes(t.value) &&
						(t.label.toLowerCase().includes(partial) || t.value.toLowerCase().includes(partial))
				);
				sigilItems = filtered.map((t) => ({ label: t.label, value: t.value }));
			}
			if (sigilItems.length > 0) {
				autocompleteOpen = true;
				sigilSelected = 0;
			} else {
				autocompleteOpen = false;
			}
		} else {
			autocompleteOpen = false;
			sigilItems = [];
		}
	});

	$effect(() => {
		// Reactive to all filter state + query
		const q = query;
		const cFilters = companionFilters;
		const tFilters = typeFilters;
		const af = after;
		const bf = before;

		clearTimeout(debounceTimer);
		currentController?.abort();

		const trimmed = q.trim();
		const active = cFilters.length > 0 || tFilters.length > 0 || !!af || !!bf;

		if (trimmed.length < 2 && !active) {
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
				const parts: string[] = [];
				if (trimmed.length >= 2) parts.push(`q=${encodeURIComponent(trimmed)}`);
				for (const cf of cFilters) parts.push(`companion=${encodeURIComponent(cf.id)}`);
				for (const tf of tFilters) parts.push(`type=${encodeURIComponent(tf)}`);
				if (af) parts.push(`after=${encodeURIComponent(af)}`);
				if (bf) parts.push(`before=${encodeURIComponent(bf)}`);
				const qs = parts.join('&');

				const res = await fetch(`/api/search?${qs}`, {
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

	function selectSigil(i: number) {
		const item = sigilItems[i];
		if (!item) return;
		const tok = parseSigilToken(query);
		if (!tok) return;

		if (tok.sigil === '@') {
			// companion
			if (!companionFilters.some((f) => f.id === item.value)) {
				companionFilters = [...companionFilters, { id: item.value, name: item.label }];
			}
		} else {
			// type
			const v = item.value as SearchEntityType;
			if (!typeFilters.includes(v)) {
				typeFilters = [...typeFilters, v];
			}
		}

		query = stripSigilToken(query, tok);
		autocompleteOpen = false;
		sigilItems = [];
		sigilSelected = 0;
		tick().then(() => inputEl?.focus());
	}

	function removeCompanionFilter(id: string) {
		companionFilters = companionFilters.filter((f) => f.id !== id);
	}

	function removeTypeFilter(type: SearchEntityType) {
		typeFilters = typeFilters.filter((t) => t !== type);
	}

	function close() {
		open = false;
	}

	function splitOnce(str: string, sep: string): [string, string] {
		const idx = str.indexOf(sep);
		if (idx === -1) return [str, ''];
		return [str.slice(0, idx), str.slice(idx + sep.length)];
	}

	type GroupKey = SearchEntityType;

	const GROUP_ORDER: GroupKey[] = [
		'journal',
		'daily',
		'health',
		'weight',
		'reminder',
		'document',
		'media'
	];

	let groups = $derived(
		(() => {
			// Plain object keyed by entity type — derived locally per recompute, so no
			// reactive Map (and no svelte/prefer-svelte-reactivity violation) needed.
			const byType: Partial<Record<GroupKey, ClientSearchResult[]>> = {};
			for (const r of results) {
				(byType[r.type] ??= []).push(r);
			}
			return GROUP_ORDER.filter((k) => byType[k]).map((k) => ({ type: k, items: byType[k]! }));
		})()
	);

	// Flat ordered list for keyboard navigation
	let flatResults = $derived(
		groups.flatMap((g: { type: GroupKey; items: ClientSearchResult[] }) => g.items)
	);

	function handleKeydown(e: KeyboardEvent) {
		// Sigil autocomplete intercept — must run before any other handling
		if (autocompleteOpen) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				sigilSelected = Math.min(sigilSelected + 1, sigilItems.length - 1);
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				sigilSelected = Math.max(sigilSelected - 1, 0);
				return;
			}
			if (e.key === 'Enter') {
				e.preventDefault();
				selectSigil(sigilSelected);
				return;
			}
			if (e.key === 'Escape') {
				autocompleteOpen = false;
				return;
			}
		}

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
			weight: 'search.group.weight',
			media: 'search.group.media'
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

	// Whether to show the results hint (no query, no filters)
	let showHint = $derived(query.trim().length < 2 && !hasFilters());
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
			<!-- Input row -->
			<div class="flex items-center gap-2 px-4 py-3 border-b border-border">
				<Search class="h-4 w-4 shrink-0 text-muted-foreground" />
				<div class="relative flex-1">
					<input
						bind:this={inputEl}
						bind:value={query}
						type="search"
						role="combobox"
						aria-expanded={autocompleteOpen || results.length > 0}
						aria-controls={autocompleteOpen ? 'search-sigil-popup' : 'search-results'}
						aria-activedescendant={autocompleteOpen
							? `sigil-option-${sigilSelected}`
							: selectedIndex >= 0
								? `search-option-${selectedIndex}`
								: undefined}
						autocomplete="off"
						placeholder={t(locale, 'search.placeholder')}
						class="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>

					<!-- Sigil autocomplete popup -->
					{#if autocompleteOpen}
						<ul
							id="search-sigil-popup"
							role="listbox"
							aria-label={t(locale, 'aria.sigilAutocomplete')}
							class="absolute left-0 top-full mt-1 z-20 w-full min-w-[12rem] rounded-md border border-border bg-popover shadow-md py-1"
						>
							{#each sigilItems as item, i (item.value)}
								<li
									id="sigil-option-{i}"
									role="option"
									aria-selected={i === sigilSelected}
									onclick={() => selectSigil(i)}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											selectSigil(i);
										}
									}}
									tabindex="-1"
									class="px-3 py-1.5 text-sm cursor-pointer {i === sigilSelected
										? 'bg-accent text-accent-foreground'
										: 'hover:bg-accent/50'}"
								>
									{item.label}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>

			<!-- Active filter chips -->
			{#if companionFilters.length > 0 || typeFilters.length > 0 || after || before}
				<div class="flex flex-wrap gap-1.5 px-4 py-2 border-b border-border">
					{#each companionFilters as cf (cf.id)}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-medium px-2 py-0.5"
						>
							{cf.name}
							<button
								type="button"
								aria-label={t(locale, 'search.filter.removeCompanion', { name: cf.name })}
								onclick={() => removeCompanionFilter(cf.id)}
								class="hover:opacity-70 transition-opacity"
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
					{#each typeFilters as tf (tf)}
						{@const label = groupLabel(tf)}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-2 py-0.5"
						>
							{label}
							<button
								type="button"
								aria-label={t(locale, 'search.filter.removeType', { type: label })}
								onclick={() => removeTypeFilter(tf)}
								class="hover:opacity-70 transition-opacity"
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/each}
					{#if after}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-2 py-0.5"
						>
							{t(locale, 'search.filter.after')}: {after}
							<button
								type="button"
								aria-label={t(locale, 'search.filter.removeAfter')}
								onclick={() => (after = '')}
								class="hover:opacity-70 transition-opacity"
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/if}
					{#if before}
						<span
							class="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground text-xs font-medium px-2 py-0.5"
						>
							{t(locale, 'search.filter.before')}: {before}
							<button
								type="button"
								aria-label={t(locale, 'search.filter.removeBefore')}
								onclick={() => (before = '')}
								class="hover:opacity-70 transition-opacity"
							>
								<X class="h-3 w-3" />
							</button>
						</span>
					{/if}
				</div>
			{/if}

			<!-- Date range controls -->
			<div class="flex gap-4 px-4 py-2 border-b border-border">
				<label class="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{t(locale, 'search.filter.after')}</span>
					<input
						type="date"
						name="after"
						bind:value={after}
						class="rounded border border-border bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
					/>
				</label>
				<label class="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{t(locale, 'search.filter.before')}</span>
					<input
						type="date"
						name="before"
						bind:value={before}
						class="rounded border border-border bg-transparent px-2 py-0.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring"
					/>
				</label>
			</div>

			<!-- Results area -->
			<div class="max-h-[60vh] overflow-y-auto">
				{#if showHint}
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
														{#each item.snippet.split('\x01') as part, i (i)}
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
