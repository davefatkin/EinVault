<script lang="ts">
	import { buildSparklinePath } from './weightSparkline.js';

	interface Props {
		points: { date: Date | string; kg: number }[];
		width?: number;
		height?: number;
		class?: string;
	}

	let { points, width = 120, height = 36, class: className = '' }: Props = $props();

	let values = $derived(points.map((p) => p.kg));
	let linePath = $derived(buildSparklinePath(values, width, height));

	// Area fill: close the path back along the bottom edge
	let areaPath = $derived(linePath.length > 0 ? `${linePath}L${width},${height}L0,${height}Z` : '');
</script>

{#if linePath}
	<svg
		viewBox="0 0 {width} {height}"
		{width}
		{height}
		aria-label="Weight trend"
		role="img"
		class="overflow-visible {className}"
	>
		<!-- faded area fill -->
		<path d={areaPath} fill="currentColor" class="text-teal opacity-10" stroke="none" />
		<!-- sparkline stroke -->
		<path
			d={linePath}
			fill="none"
			stroke="currentColor"
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="text-teal"
		/>
	</svg>
{/if}
