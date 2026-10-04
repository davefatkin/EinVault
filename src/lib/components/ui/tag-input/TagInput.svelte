<script lang="ts">
	import { X } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { normalizeTag, splitTagInput, NOTE_MAX_TAGS } from '$lib/notes';

	interface Props {
		tags?: string[];
		suggestions?: string[];
		id: string;
		name?: string;
		pendingName?: string;
		describedby?: string;
		onchange?: (tags: string[]) => void;
	}

	let {
		tags = $bindable([]),
		suggestions = [],
		id,
		name = 'tags',
		pendingName = 'tagsPending',
		describedby,
		onchange
	}: Props = $props();
	const locale = getLocale();

	let text = $state('');
	let open = $state(false);
	let active = $state(-1);
	const listId = $derived(`${id}-suggestions`);

	const atLimit = $derived(tags.length >= NOTE_MAX_TAGS);
	const matches = $derived.by(() => {
		const q = normalizeTag(text) ?? '';
		return suggestions
			.filter((s) => !tags.includes(s) && (q === '' || s.startsWith(q)))
			.slice(0, 6);
	});
	const showList = $derived(open && !atLimit && matches.length > 0);

	function add(raw: string[]) {
		const next = [...tags];
		for (const r of raw) {
			const tag = normalizeTag(r);
			if (tag && !next.includes(tag) && next.length < NOTE_MAX_TAGS) next.push(tag);
		}
		if (next.length !== tags.length) {
			tags = next;
			onchange?.(tags);
		}
	}

	function remove(tag: string) {
		tags = tags.filter((t) => t !== tag);
		onchange?.(tags);
	}

	function commitText() {
		add(splitTagInput(text));
		text = '';
		active = -1;
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown' && matches.length > 0) {
			e.preventDefault();
			open = true;
			active = (active + 1) % matches.length;
		} else if (e.key === 'ArrowUp' && matches.length > 0) {
			e.preventDefault();
			active = active <= 0 ? matches.length - 1 : active - 1;
		} else if (e.key === 'Enter') {
			// Enter adds a tag; it must not submit the surrounding form.
			const pick = active >= 0 ? matches[active] : undefined;
			if (showList && pick) {
				e.preventDefault();
				add([pick]);
				text = '';
				active = -1;
			} else if (text.trim()) {
				e.preventDefault();
				commitText();
			}
		} else if (e.key === ',') {
			e.preventDefault();
			commitText();
		} else if (e.key === 'Backspace' && text === '' && tags.length > 0) {
			remove(tags[tags.length - 1]);
		} else if (e.key === 'Escape') {
			open = false;
			active = -1;
		}
	}

	function oninput() {
		open = true;
		active = -1;
		// Pasted text with commas becomes several tags right away.
		if (text.includes(',')) commitText();
	}
</script>

<div
	class="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 focus-within:ring-1 focus-within:ring-ring"
>
	{#each tags as tag (tag)}
		<span
			class="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
		>
			{tag}
			<button
				type="button"
				class="rounded-full p-0.5 hover:bg-accent"
				aria-label={t(locale, 'page.notes.removeTag', { tag })}
				onclick={() => remove(tag)}
			>
				<X class="h-3 w-3" />
			</button>
			<input type="hidden" {name} value={tag} />
		</span>
	{/each}
	<div class="relative min-w-[8rem] flex-1">
		<input
			{id}
			name={pendingName}
			type="text"
			role="combobox"
			autocomplete="off"
			disabled={atLimit}
			aria-expanded={showList}
			aria-controls={listId}
			aria-autocomplete="list"
			aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
			aria-describedby={describedby}
			class="w-full bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed"
			bind:value={text}
			{oninput}
			{onkeydown}
			onfocus={() => (open = true)}
			onblur={() => {
				open = false;
				commitText();
			}}
		/>
		{#if showList}
			<ul
				id={listId}
				role="listbox"
				aria-label={t(locale, 'page.notes.tagSuggestions')}
				class="absolute left-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg"
			>
				{#each matches as s, i (s)}
					<li
						id="{listId}-{i}"
						role="option"
						aria-selected={i === active}
						class="cursor-pointer px-3 py-1.5 text-sm {i === active
							? 'bg-accent text-foreground'
							: 'text-muted-foreground'}"
						onmousedown={(e) => {
							// mousedown, not click: runs before the input's blur.
							e.preventDefault();
							add([s]);
							text = '';
							active = -1;
						}}
					>
						{s}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
