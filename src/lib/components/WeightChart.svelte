<script lang="ts">
	import { t, getLocale } from '$lib/i18n';
	import {
		filterByRange,
		buildAreaPath,
		buildLinePath,
		percentChange,
		convertWeight,
		type WeightPoint,
		type WeightRange
	} from '$lib/weightChart';
	import { TrendingUp, TrendingDown } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	interface Props {
		/** Weight entries, ascending by recordedAt. */
		entries: WeightPoint[];
		now?: Date;
		/** When provided, the empty state shows a "Record weight" CTA. Omit to keep it message-only (e.g. read-only / archived). */
		onAddWeight?: () => void;
	}
	let { entries, now = undefined, onAddWeight = undefined }: Props = $props();
	const uid = $props.id();
	const locale = getLocale();

	const W = 600;
	const H = 120;
	let range = $state<WeightRange>('6m');

	let ref = $derived(now ?? new Date());
	let visible = $derived(filterByRange(entries, range, ref));
	let effective = $derived(visible.length < 2 && entries.length >= 2 ? entries : visible);
	let latest = $derived(entries.at(-1) ?? null);
	let displayUnit = $derived(latest?.unit ?? 'lbs');
	let normalized = $derived(effective.map((p) => convertWeight(p.weight, p.unit, displayUnit)));
	let values = $derived(normalized);
	let areaPath = $derived(buildAreaPath(values, W, H));
	let linePath = $derived(buildLinePath(values, W, H));
	let change = $derived(
		percentChange(
			effective.map((p) => ({ ...p, weight: convertWeight(p.weight, p.unit, displayUnit) }))
		)
	);

	const RANGES: {
		value: WeightRange;
		key: 'page.health.range6m' | 'page.health.range1y' | 'page.health.rangeAll';
	}[] = [
		{ value: '6m', key: 'page.health.range6m' },
		{ value: '1y', key: 'page.health.range1y' },
		{ value: 'all', key: 'page.health.rangeAll' }
	];
</script>

<div class="rounded-2xl border bg-card p-4">
	{#if !latest}
		<EmptyState size="sm" tint="muted" title={t(locale, 'page.health.noWeightYet')}>
			{#snippet icon()}<TrendingUp class="h-5 w-5" />{/snippet}
			{#snippet action()}
				{#if onAddWeight}
					<Button size="sm" onclick={onAddWeight}>{t(locale, 'nav.fab.recordWeight')}</Button>
				{/if}
			{/snippet}
		</EmptyState>
	{:else}
		<div class="flex items-start justify-between gap-3">
			<div>
				<p class="font-display text-2xl font-bold text-foreground">
					{latest.weight}
					<span class="text-sm font-normal text-muted-foreground">{latest.unit}</span>
				</p>
				{#if change !== null}
					<p class="flex items-center gap-1 text-xs {change >= 0 ? 'text-teal' : 'text-coral'}">
						{#if change >= 0}<TrendingUp class="h-3.5 w-3.5" />{:else}<TrendingDown
								class="h-3.5 w-3.5"
							/>{/if}
						{change >= 0 ? '+' : ''}{change.toFixed(1)}%
					</p>
				{/if}
			</div>
			<div class="flex gap-1" role="group" aria-label={t(locale, 'page.health.weightTrend')}>
				{#each RANGES as r (r.value)}
					<button
						type="button"
						onclick={() => (range = r.value)}
						aria-pressed={range === r.value}
						class="rounded-md px-2 py-0.5 text-xs transition-colors {range === r.value
							? 'bg-primary/10 text-primary font-medium'
							: 'text-muted-foreground hover:text-foreground'}"
					>
						{t(locale, r.key)}
					</button>
				{/each}
			</div>
		</div>
		{#if values.length >= 2}
			<svg
				viewBox="0 0 {W} {H}"
				preserveAspectRatio="none"
				class="mt-3 h-24 w-full"
				role="img"
				aria-label={t(locale, 'page.health.weightChartAria')}
			>
				<defs>
					<linearGradient id="weightFill-{uid}" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stop-color="hsl(var(--primary))" stop-opacity="0.35" />
						<stop offset="100%" stop-color="hsl(var(--primary))" stop-opacity="0" />
					</linearGradient>
				</defs>
				<path d={areaPath} fill="url(#weightFill-{uid})" />
				<path
					d={linePath}
					fill="none"
					stroke="hsl(var(--primary))"
					stroke-width="2"
					vector-effect="non-scaling-stroke"
				/>
			</svg>
		{:else}
			<p class="mt-3 text-xs text-muted-foreground">{t(locale, 'page.health.oneWeightNeedMore')}</p>
		{/if}
	{/if}
</div>
