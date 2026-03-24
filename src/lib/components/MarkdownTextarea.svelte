<script lang="ts">
	import { renderMarkdown } from '$lib/markdown';

	interface Props {
		name: string;
		value?: string;
		placeholder?: string;
		class?: string;
		id?: string;
		rows?: number;
		oninput?: (e: Event) => void;
	}

	let {
		name,
		value = $bindable(''),
		placeholder = '',
		class: className = '',
		id,
		rows = 4,
		oninput
	}: Props = $props();

	let mode = $state<'write' | 'preview'>('write');

	let preview = $derived(mode === 'preview' && value ? renderMarkdown(value) : '');

	const fieldClass =
		'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
</script>

<div class="space-y-1">
	<div class="flex gap-1 text-xs mb-1">
		<button
			type="button"
			onclick={() => (mode = 'write')}
			class="px-2 py-0.5 rounded transition-colors
				{mode === 'write'
				? 'bg-primary/10 text-primary font-medium'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			Write
		</button>
		<button
			type="button"
			onclick={() => (mode = 'preview')}
			class="px-2 py-0.5 rounded transition-colors
				{mode === 'preview'
				? 'bg-primary/10 text-primary font-medium'
				: 'text-muted-foreground hover:text-foreground'}"
		>
			Preview
		</button>
	</div>

	<!-- Textarea always in DOM for form submission -->
	<textarea
		{id}
		{name}
		{placeholder}
		{rows}
		{oninput}
		bind:value
		class="{fieldClass} resize-none font-mono {className}"
		style={mode === 'preview' ? 'display:none' : ''}
	></textarea>

	{#if mode === 'preview'}
		<div
			class="{fieldClass} prose prose-sm dark:prose-invert max-w-none"
			style="min-height: {rows * 1.5}rem"
		>
			{#if value}
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html preview}
			{:else}
				<span class="italic text-muted-foreground">Nothing to preview</span>
			{/if}
		</div>
	{/if}

	<details class="group mt-1.5">
		<summary
			class="inline-flex cursor-pointer select-none list-none items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors [&::-webkit-details-marker]:hidden"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="h-3 w-3 transition-transform group-open:rotate-90"
				aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg
			>
			Markdown supported
		</summary>
		<div class="mt-2 rounded-md bg-muted/60 px-3 py-2.5 text-xs space-y-1.5">
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 items-baseline">
				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">**bold**</code>
				<span><strong>bold</strong></span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">_italic_</code>
				<span><em>italic</em></span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">## Heading</code>
				<span class="font-semibold text-sm">Heading</span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">- item</code>
				<span>bullet list item</span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">1. item</code>
				<span>numbered list item</span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">&gt; note</code>
				<span class="border-l-2 border-border pl-2 text-muted-foreground">note</span>

				<code class="font-mono text-[11px] text-foreground/70 whitespace-nowrap">[text](url)</code>
				<span class="text-primary underline">link text</span>
			</div>
		</div>
	</details>
</div>
