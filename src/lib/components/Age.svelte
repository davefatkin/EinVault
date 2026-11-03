<script lang="ts">
	// Companion age with a full-age hint (#398). Renders nothing without a usable
	// dob. The hint is "Approximate birth date" for a guessed dob, or the full
	// age plus birth date from one year up; otherwise the age is plain text.
	//
	// Interactive: a button that opens a popover="auto" hint on tap or click,
	// mouse hover and keyboard focus. The popover sits in the top layer, so a
	// truncating or overflow-hidden parent can't clip it, and light dismiss and
	// Escape close it. Not interactive (inside the dashboard's role="link" card,
	// where a focusable child would add a tab stop): a native title tooltip plus
	// sr-only text, with nothing focusable.
	import { ageParts, formatAge, formatFullAge, type AgeStyle } from '#lib/age.js';
	import { formatDateOnly } from '#lib/date.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	let {
		dob,
		approximate,
		today,
		style = 'long',
		interactive = true
	}: {
		dob: string | null;
		approximate: boolean;
		today: string;
		style?: AgeStyle;
		interactive?: boolean;
	} = $props();

	const locale = getLocale();
	const uid = $props.id();
	const tipId = `${uid}-age-hint`;

	const label = $derived(formatAge(dob, locale, { today, style, approximate }));
	const hint = $derived.by((): string[] | null => {
		if (!label || !dob) return null;
		if (approximate) return [t(locale, 'age.approximateHint')];
		const parts = ageParts(dob, today);
		if (!parts || parts.years < 1) return null;
		const full = formatFullAge(dob, locale, { today });
		const born = formatDateOnly(dob, locale);
		return [full, born ? t(locale, 'age.bornOn', { date: born }) : null].filter(
			(line): line is string => !!line
		);
	});

	let trigger = $state<HTMLButtonElement>();
	let tip = $state<HTMLElement>();
	let open = $state(false);

	// No-op where the popover API is missing; the button's popovertarget does
	// nothing there either.
	function setOpen(next: boolean) {
		if (tip && 'togglePopover' in tip) tip.togglePopover(next);
	}

	// Below the trigger, flipped above when there's no room, kept inside the
	// viewport. Viewport coordinates, since popovers are position: fixed.
	function place() {
		if (!trigger || !tip) return;
		const r = trigger.getBoundingClientRect();
		const vw = document.documentElement.clientWidth;
		const vh = document.documentElement.clientHeight;
		const gap = 6;
		const pad = 8;
		let top = r.bottom + gap;
		if (top + tip.offsetHeight > vh - pad && r.top - gap - tip.offsetHeight >= pad) {
			top = r.top - gap - tip.offsetHeight;
		}
		const left = Math.max(pad, Math.min(r.left, vw - tip.offsetWidth - pad));
		tip.style.top = `${top}px`;
		tip.style.left = `${left}px`;
	}

	$effect(() => {
		if (!open) return;
		place();
		window.addEventListener('scroll', place, { capture: true, passive: true });
		window.addEventListener('resize', place);
		return () => {
			window.removeEventListener('scroll', place, { capture: true });
			window.removeEventListener('resize', place);
		};
	});
</script>

{#if label}
	{#if !hint}
		{label}
	{:else if interactive}
		<button
			bind:this={trigger}
			type="button"
			popovertarget={tipId}
			popovertargetaction="show"
			aria-describedby={tipId}
			class="cursor-help rounded-sm underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onpointerenter={(e) => {
				if (e.pointerType !== 'touch') setOpen(true);
			}}
			onpointerleave={(e) => {
				if (e.pointerType !== 'touch') setOpen(false);
			}}
			onfocus={(e) => {
				if (e.currentTarget.matches(':focus-visible')) setOpen(true);
			}}
			onblur={() => setOpen(false)}>{label}</button
		><span
			bind:this={tip}
			id={tipId}
			popover="auto"
			role="tooltip"
			onbeforetoggle={(e) => {
				// Position before the first paint so it never flashes centered.
				if (e.newState === 'open') requestAnimationFrame(place);
			}}
			ontoggle={(e) => {
				open = e.newState === 'open';
			}}
			class="inset-auto m-0 w-max max-w-64 rounded-md border border-border bg-popover px-2.5 py-1.5 text-left text-xs text-popover-foreground shadow-lg"
		>
			{#each hint as line (line)}<span class="block">{line}</span>{/each}
		</span>
	{:else}
		<span title={hint.join('\n')} class="underline decoration-dotted underline-offset-2"
			>{label}</span
		><span class="sr-only"> ({hint.join('; ')})</span>
	{/if}
{/if}
