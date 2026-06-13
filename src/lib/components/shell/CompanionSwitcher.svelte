<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import { ChevronDown, LayoutGrid } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import type { CareStatus } from '$lib/careStatus';

	type Companion = { id: string; name: string; avatarPath?: string | null };

	interface Props {
		companions: Companion[];
		activeCompanion: Companion;
		/** Status dots in the dropdown. Pass {} to omit dot coloring (defaults to up-to-date). */
		companionStatus?: Record<string, CareStatus>;
		/** Owner switcher offers an "Overview" entry; caretaker does not. */
		includeOverview?: boolean;
		/** Route prefix for switching: '' for owner (/{id}), '/care' for caretaker (/care/{id}). */
		basePath?: '' | '/care';
	}

	let {
		companions,
		activeCompanion,
		companionStatus = {},
		includeOverview = false,
		basePath = ''
	}: Props = $props();

	const locale = getLocale();
	const OVERVIEW_VALUE = '__overview__';
	let open = $state(false);

	function statusDotClass(id: string): string {
		const s = companionStatus[id] ?? 'up-to-date';
		if (s === 'needs-attention') return 'bg-coral';
		if (s === 'due-today') return 'bg-gold';
		return 'bg-teal';
	}

	function statusTitle(id: string): string {
		const s = companionStatus[id] ?? 'up-to-date';
		if (s === 'needs-attention') return t(locale, 'overview.careStatus.needsAttention');
		if (s === 'due-today') return t(locale, 'overview.careStatus.dueToday');
		return t(locale, 'overview.careStatus.upToDate');
	}

	function switchTo(id: string) {
		open = false;
		if (id === OVERVIEW_VALUE) {
			goto(basePath || '/');
			return;
		}
		const parts = page.url.pathname.split('/');
		const idIndex = basePath === '/care' ? 2 : 1;
		if (parts[idIndex] === activeCompanion.id) {
			const section = parts.slice(idIndex + 1).join('/');
			goto(`${basePath}/${id}${section ? `/${section}` : ''}`);
		} else {
			goto(`${basePath}/${id}`);
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}

	let isOnOverview = $derived(page.url.pathname === (basePath || '/'));
</script>

{#if companions.length > 1}
	<div class="relative flex-1 min-w-0" role="none">
		<button
			type="button"
			onclick={() => (open = !open)}
			onkeydown={handleKeydown}
			aria-label={t(locale, 'layout.switchCompanion')}
			aria-expanded={open}
			aria-haspopup="listbox"
			class="flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-accent min-w-0"
		>
			<CompanionAvatar
				companionId={activeCompanion.id}
				avatarPath={activeCompanion.avatarPath}
				name={activeCompanion.name}
				size="sm"
			/>
			<span class="flex-1 min-w-0 font-semibold text-sm text-foreground truncate">
				{activeCompanion.name}
			</span>
			<ChevronDown
				class="h-4 w-4 shrink-0 text-muted-foreground transition-transform {open
					? 'rotate-180'
					: ''}"
			/>
		</button>

		{#if open}
			<button
				type="button"
				class="fixed inset-0 z-40 cursor-default"
				onclick={() => (open = false)}
				aria-label={t(locale, 'aria.closeSwitcher')}
				tabindex="-1"
			></button>
			<ul
				role="listbox"
				aria-label={t(locale, 'layout.switchCompanion')}
				class="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-lg"
			>
				{#if includeOverview}
					<li role="option" aria-selected={isOnOverview}>
						<button
							type="button"
							onclick={() => switchTo(OVERVIEW_VALUE)}
							class="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground {isOnOverview
								? 'bg-accent text-foreground'
								: ''}"
						>
							<LayoutGrid class="h-4 w-4 shrink-0" />
							{t(locale, 'nav.overview')}
						</button>
					</li>
				{/if}
				{#each companions as c (c.id)}
					<li role="option" aria-selected={c.id === activeCompanion.id}>
						<button
							type="button"
							onclick={() => switchTo(c.id)}
							class="flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-foreground {c.id ===
							activeCompanion.id
								? 'bg-accent text-foreground font-medium'
								: 'text-muted-foreground'}"
						>
							<CompanionAvatar
								companionId={c.id}
								avatarPath={c.avatarPath}
								name={c.name}
								size="sm"
							/>
							<span class="truncate">{c.name}</span>
							<span
								class="ml-auto h-2 w-2 rounded-full shrink-0 {statusDotClass(c.id)}"
								title={statusTitle(c.id)}
							></span>
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{:else}
	<!-- Single companion — static display -->
	<div class="flex items-center gap-2.5 flex-1 min-w-0">
		<CompanionAvatar
			companionId={activeCompanion.id}
			avatarPath={activeCompanion.avatarPath}
			name={activeCompanion.name}
			size="sm"
		/>
		<span class="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
			{activeCompanion.name}
		</span>
	</div>
{/if}
