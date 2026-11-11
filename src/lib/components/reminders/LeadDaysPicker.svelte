<script lang="ts">
	import { tick } from 'svelte';
	import { Check, Plus } from '@lucide/svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		MAX_LEAD_TIMES,
		leadChipOptions,
		maxLeadDays,
		pruneLeadDays,
		serializeLeadDays
	} from '#lib/reminderLeadTimes.js';

	let {
		value = $bindable([]),
		recurrence = null,
		name = 'notifyLeadDays',
		label
	}: {
		value?: number[];
		recurrence?: { unit: 'day' | 'week' | 'month' | 'year'; interval: number } | null;
		name?: string;
		/** The legend; "Heads-up" by default. */
		label?: string;
	} = $props();

	const locale = getLocale();

	const offered = $derived(leadChipOptions(value, recurrence));

	// Leads that are too long for the current repeat period are hidden and not saved, but
	// kept in `value` so they come back if the period grows again (e.g. while retyping it).
	const effective = $derived(pruneLeadDays(value, recurrence));

	function chipLabel(n: number): string {
		if (n === 7 || n === 14) {
			return t(locale, n === 7 ? 'page.reminders.leadWeek' : 'page.reminders.leadWeeks', {
				count: n / 7
			});
		}
		return t(locale, n === 1 ? 'page.reminders.leadDay' : 'page.reminders.leadDays', {
			count: n
		});
	}

	function toggle(n: number) {
		value = effective.includes(n) ? effective.filter((v) => v !== n) : [...effective, n];
	}

	const full = $derived(effective.length >= MAX_LEAD_TIMES);

	// A value outside the presets, typed in. Shown as a normal chip once added.
	const max = $derived(maxLeadDays(recurrence));
	const uid = $props.id();
	let customOpen = $state(false);
	let customText = $state('');
	let customError = $state(false);
	let customInput = $state<HTMLInputElement>();
	let customChip = $state<HTMLButtonElement>();
	let chips = $state<HTMLDivElement>();

	// No room left (three picked, or a daily repeat): the typed value can't be added.
	$effect(() => {
		if (customOpen && (full || max < 1)) resetCustom();
	});

	function resetCustom() {
		customOpen = false;
		customText = '';
		customError = false;
	}

	async function openCustom() {
		customOpen = true;
		customError = false;
		await tick();
		customInput?.focus();
	}

	async function closeCustom(added?: number) {
		resetCustom();
		await tick();
		const target =
			added === undefined
				? customChip
				: chips?.querySelector<HTMLButtonElement>(`button[data-lead="${added}"]`);
		(target && !target.disabled ? target : customChip)?.focus();
	}

	/** The typed value as a day count, or null when it isn't a whole number in range. */
	function typedLead(): number | null {
		const text = customText.trim();
		const n = Number(text);
		return /^\d+$/.test(text) && n >= 1 && n <= max ? n : null;
	}

	function withLead(n: number): number[] {
		if (effective.includes(n) || full) return effective;
		return [...effective, n];
	}

	function addCustom() {
		const n = typedLead();
		if (n === null) {
			customError = true;
			return;
		}
		value = withLead(n);
		void closeCustom(n);
	}

	function onCustomKey(e: KeyboardEvent) {
		// Enter would otherwise submit the surrounding form.
		if (e.key === 'Enter') {
			e.preventDefault();
			addCustom();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			void closeCustom();
		}
	}

	// Saving with a valid value typed but not added still saves it. This runs while the
	// form builds its data, for a plain submit and for use:enhance alike.
	$effect(() => {
		const form = customOpen ? customInput?.form : null;
		if (!form) return;
		const onFormData = (e: FormDataEvent) => {
			const n = typedLead();
			if (n === null) return;
			const next = withLead(n);
			e.formData.set(name, serializeLeadDays(next) ?? '');
			value = next;
			resetCustom();
		};
		form.addEventListener('formdata', onFormData);
		return () => form.removeEventListener('formdata', onFormData);
	});
</script>

<fieldset class="space-y-1.5">
	<legend class="text-sm font-medium text-foreground"
		>{label ?? t(locale, 'page.reminders.leadLabel')}</legend
	>
	<input type="hidden" {name} value={serializeLeadDays(effective) ?? ''} />
	<div bind:this={chips} class="flex flex-wrap gap-2">
		{#each offered as n (n)}
			{@const active = effective.includes(n)}
			<button
				type="button"
				aria-pressed={active}
				data-lead={n}
				disabled={!active && full}
				onclick={() => toggle(n)}
				class="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors
				focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
				{active
					? 'bg-primary/10 border-primary ring-1 ring-inset ring-primary/40 text-primary'
					: 'border-border text-muted-foreground hover:text-foreground'}"
			>
				{#if active}
					<Check class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{/if}
				{chipLabel(n)}
			</button>
		{/each}
		{#if max >= 1 && !customOpen}
			<button
				bind:this={customChip}
				type="button"
				disabled={full}
				onclick={openCustom}
				class="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Plus class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
				{t(locale, 'page.reminders.leadCustom')}
			</button>
		{/if}
	</div>
	{#if customOpen && max >= 1}
		<div class="flex flex-wrap items-center gap-2">
			<label for="{uid}-custom" class="sr-only">{t(locale, 'page.reminders.leadCustomDays')}</label>
			<input
				bind:this={customInput}
				bind:value={customText}
				id="{uid}-custom"
				type="text"
				inputmode="numeric"
				autocomplete="off"
				aria-invalid={customError}
				aria-describedby={customError ? `${uid}-custom-error` : undefined}
				onkeydown={onCustomKey}
				oninput={() => (customError = false)}
				class="h-11 w-20 rounded-lg border border-input bg-background px-2 text-sm"
			/>
			<span class="text-sm text-muted-foreground" aria-hidden="true"
				>{t(locale, 'page.reminders.leadCustomDays')}</span
			>
			<button
				type="button"
				onclick={addCustom}
				class="inline-flex h-11 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				{t(locale, 'page.reminders.leadCustomAdd')}
			</button>
			<button
				type="button"
				onclick={() => closeCustom()}
				class="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				{t(locale, 'common.cancel')}
			</button>
		</div>
		{#if customError}
			<p id="{uid}-custom-error" role="alert" class="text-xs text-coral">
				{t(locale, 'page.reminders.leadCustomError', { max })}
			</p>
		{/if}
	{/if}
</fieldset>
