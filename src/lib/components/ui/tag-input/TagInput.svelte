<script lang="ts">
	import { X } from '@lucide/svelte';
	import { t, getLocale } from '$lib/i18n';
	import { commitTags, matchSuggestions, splitTagText, type TagCommitError } from './commit';

	interface Props {
		tags?: string[];
		suggestions?: string[];
		id: string;
		name?: string;
		pendingName?: string;
		describedby?: string;
		max?: number;
		normalize?: (raw: string) => string | null;
		// Shown under the input when text can't become a tag.
		invalidText: string;
		tooManyText: string;
		onchange?: (tags: string[]) => void;
	}

	let {
		tags = $bindable([]),
		suggestions = [],
		id,
		name = 'tags',
		pendingName = 'tagsPending',
		describedby,
		max = Infinity,
		normalize = (raw: string) => raw.trim() || null,
		invalidText,
		tooManyText,
		onchange
	}: Props = $props();
	const locale = getLocale();

	let text = $state('');
	let open = $state(false);
	let active = $state(-1);
	let error = $state<TagCommitError | null>(null);
	const listId = $derived(`${id}-suggestions`);
	const errorId = $derived(`${id}-error`);

	const atLimit = $derived(tags.length >= max);
	const matches = $derived(matchSuggestions(suggestions, tags, text, normalize));
	const showList = $derived(open && !atLimit && matches.length > 0);
	const describedBy = $derived(
		[describedby, error ? errorId : null].filter(Boolean).join(' ') || undefined
	);

	function setTags(next: string[]) {
		if (next.length === tags.length) return;
		tags = next;
		onchange?.(tags);
	}

	// Invalid or over-limit text stays in the input with a message saying why.
	function commit(parts: string[]) {
		const r = commitTags(tags, parts, { max, normalize });
		setTags(r.tags);
		text = r.rest.join(', ');
		error = r.error;
		active = -1;
	}

	function remove(tag: string) {
		error = null;
		setTags(tags.filter((t) => t !== tag));
	}

	function onkeydown(e: KeyboardEvent) {
		// Keys that finish an IME composition must not commit a half-composed tag.
		if (e.isComposing || e.keyCode === 229) return;
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
				commit([pick]);
			} else if (text.trim()) {
				e.preventDefault();
				commit(splitTagText(text));
			}
		} else if (e.key === ',') {
			e.preventDefault();
			commit(splitTagText(text));
		} else if (e.key === 'Backspace' && !e.repeat && text === '' && tags.length > 0) {
			// Ignore auto-repeat so holding Backspace removes one chip, not all.
			remove(tags[tags.length - 1]);
		} else if (e.key === 'Escape' && showList) {
			// Only swallow Escape when it closes the list; otherwise a parent dialog gets it.
			e.stopPropagation();
			open = false;
			active = -1;
		}
	}

	function oninput(e: Event) {
		open = true;
		active = -1;
		error = null;
		if ((e as InputEvent).isComposing) return;
		// Pasted text with commas becomes several tags right away.
		if (text.includes(',')) commit(splitTagText(text));
	}
</script>

<div class="space-y-1.5">
	<div
		class="flex min-h-10 w-full flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 focus-within:ring-1 {error
			? 'border-coral focus-within:ring-coral'
			: 'border-input focus-within:ring-ring'}"
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
			<!-- At the limit the input stays focusable (readonly, not disabled) so
			     Backspace can still remove the last chip. -->
			<input
				{id}
				name={pendingName}
				type="text"
				role="combobox"
				autocomplete="off"
				readonly={atLimit && text === ''}
				aria-disabled={atLimit || undefined}
				aria-invalid={error ? 'true' : undefined}
				aria-expanded={showList}
				aria-controls={listId}
				aria-autocomplete="list"
				aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
				aria-describedby={describedBy}
				class="w-full bg-transparent py-1 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none aria-disabled:cursor-not-allowed"
				bind:value={text}
				{oninput}
				{onkeydown}
				onfocus={() => (open = true)}
				onblur={() => {
					open = false;
					commit(splitTagText(text));
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
								commit([s]);
							}}
						>
							{s}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
	{#if error}
		<p id={errorId} role="alert" class="text-xs text-coral">
			{error === 'invalid' ? invalidText : tooManyText}
		</p>
	{/if}
</div>
