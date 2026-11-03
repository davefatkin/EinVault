<script lang="ts">
	import { X } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import CompanionAvatar from '#lib/components/CompanionAvatar.svelte';
	import { celebrationLines, writeDismissCookie, type BannerEntry } from '#lib/celebrations.js';

	let { entries, today }: { entries: BannerEntry[]; today: string } = $props();
	const locale = getLocale();

	// Hidden locally right away; the cookie keeps them hidden on later loads and other pages.
	let dismissed = $state<string[]>([]);
	let visible = $derived(entries.filter((e) => !dismissed.includes(e.companionId)));

	function dismiss(companionId: string) {
		writeDismissCookie(companionId, today);
		dismissed = [...dismissed, companionId];
	}
</script>

{#if visible.length > 0}
	<section
		aria-label={t(locale, 'celebration.label')}
		class="rounded-xl border bg-gradient-to-br from-gold/15 to-teal/10 p-3 space-y-1"
	>
		{#each visible as e (e.companionId)}
			<div
				class="flex items-center gap-2 py-1.5 border-t border-border/40 first-of-type:border-t-0"
			>
				<a href="/{e.companionId}" class="shrink-0" tabindex="-1" aria-hidden="true">
					<CompanionAvatar
						companionId={e.companionId}
						avatarPath={e.avatarPath}
						name={e.name}
						size="sm"
					/>
				</a>
				<a
					href="/{e.companionId}"
					class="min-w-0 flex-1 text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
				>
					{#each celebrationLines(locale, e.name, e) as line (line)}
						<span class="block">{line}</span>
					{/each}
				</a>
				<button
					type="button"
					onclick={() => dismiss(e.companionId)}
					aria-label={t(locale, 'celebration.dismiss')}
					class="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<X class="h-4 w-4" />
				</button>
			</div>
		{/each}
	</section>
{/if}
