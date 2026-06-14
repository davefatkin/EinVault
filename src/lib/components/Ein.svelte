<script lang="ts">
	import { emptyStateCircleClass, type EmptyTint } from './emptyState';

	interface Props {
		pose?: 'welcome' | 'happy' | 'confused' | 'sheepish';
		tint?: EmptyTint;
		class?: string;
	}

	let { pose = 'happy', tint, class: className = 'h-32 w-32' }: Props = $props();
</script>

<div
	class="inline-flex items-center justify-center {tint
		? `rounded-full p-5 ${emptyStateCircleClass(tint)}`
		: ''}"
	data-testid="ein"
	data-pose={pose}
>
	<svg class={className} viewBox="0 0 200 175" aria-hidden="true">
		<!-- shadow -->
		<ellipse cx="100" cy="155" rx="60" ry="10" fill="#7348f4" opacity="0.1" />
		<!-- back legs -->
		<rect x="58" y="124" width="16" height="26" rx="8" fill="#f4b740" />
		<rect x="126" y="124" width="16" height="26" rx="8" fill="#f4b740" />
		<!-- body -->
		<ellipse cx="108" cy="112" rx="58" ry="34" fill="#f4b740" />
		<!-- white chest -->
		<path d="M70 100 q-14 26 6 44 q16 8 24 -4 q-10 -22 -2 -42 z" fill="#fff" />

		<!-- front paws -->
		{#if pose === 'welcome'}
			<rect x="86" y="130" width="15" height="22" rx="7" fill="#fff" />
			<rect x="92" y="96" width="13" height="24" rx="6" fill="#fff" transform="rotate(30 98 108)" />
		{:else}
			<rect x="66" y="128" width="15" height="24" rx="7" fill="#fff" />
			<rect x="86" y="130" width="15" height="22" rx="7" fill="#fff" />
		{/if}

		<!-- head (tilts when confused) -->
		<g transform={pose === 'confused' ? 'rotate(-12 62 78)' : ''}>
			<circle cx="62" cy="78" r="34" fill="#f4b740" />
			<path d="M36 60 q-6 -34 16 -40 q4 18 -2 38 z" fill="#f4b740" />
			<path d="M88 60 q6 -34 -16 -40 q-4 18 2 38 z" fill="#f4b740" />
			<path d="M40 56 q-3 -22 9 -28 q2 12 -1 26 z" fill="#ef6a45" />
			<path d="M84 56 q3 -22 -9 -28 q-2 12 1 26 z" fill="#ef6a45" />
			<ellipse cx="58" cy="90" rx="22" ry="16" fill="#fff" />

			{#if pose === 'confused'}
				<circle cx="50" cy="74" r="4.2" fill="#23203a" />
				<circle cx="74" cy="74" r="4.2" fill="#23203a" />
				<ellipse cx="58" cy="84" rx="5" ry="4" fill="#23203a" />
				<path
					d="M52 92 q6 -4 12 1"
					stroke="#23203a"
					stroke-width="3"
					fill="none"
					stroke-linecap="round"
				/>
			{:else}
				<path
					d="M44 74 q6 -7 12 0"
					stroke="#23203a"
					stroke-width="3.4"
					fill="none"
					stroke-linecap="round"
				/>
				<path
					d="M68 74 q6 -7 12 0"
					stroke="#23203a"
					stroke-width="3.4"
					fill="none"
					stroke-linecap="round"
				/>
				<ellipse cx="58" cy="84" rx="5" ry="4" fill="#23203a" />
				<path
					d="M50 90 q8 10 16 0"
					stroke="#23203a"
					stroke-width="3"
					fill="none"
					stroke-linecap="round"
				/>
				{#if pose === 'welcome' || pose === 'happy'}
					<path d="M55 94 q3 6 7 1 z" fill="#ef6a45" />
				{/if}
			{/if}

			{#if pose === 'sheepish'}
				<!-- bandage on the brow -->
				<g transform="rotate(20 83 62)">
					<rect x="74" y="57" width="18" height="9" rx="2" fill="#ef6a45" opacity="0.85" />
					<line x1="83" y1="57" x2="83" y2="66" stroke="#fff" stroke-width="1.5" />
					<line x1="74" y1="61.5" x2="92" y2="61.5" stroke="#fff" stroke-width="1.5" />
				</g>
			{/if}
		</g>

		<!-- collar + tag -->
		<path
			d="M40 104 Q62 116 84 104"
			stroke="#7348f4"
			stroke-width="8"
			fill="none"
			stroke-linecap="round"
		/>
		<circle cx="62" cy="113" r="5.5" fill="#16b5a6" stroke="#fff" stroke-width="1.5" />

		{#if pose === 'confused'}
			<text
				x="118"
				y="58"
				font-size="36"
				font-weight="700"
				fill="#7348f4"
				font-family="ui-sans-serif, system-ui, sans-serif">?</text
			>
		{/if}
	</svg>
</div>
