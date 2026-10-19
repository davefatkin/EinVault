<script lang="ts">
	import { Input } from '#lib/components/ui/input/index.js';
	import { Label } from '#lib/components/ui/label/index.js';
	import { Select } from '#lib/components/ui/select/index.js';
	import { untrack } from 'svelte';
	import { t, getLocale } from '#lib/i18n/index.js';
	import {
		RECURRENCE_INTERVAL_MAX,
		unpackMonthDay,
		type RecurrenceUnit,
		type RecurrenceAnchor
	} from '#lib/reminderRecurrence.js';
	import type { Reminder } from '#lib/server/db/schema.js';

	type EditorValue = Pick<
		Reminder,
		| 'isRecurring'
		| 'recurrenceUnit'
		| 'recurrenceInterval'
		| 'recurrenceAnchor'
		| 'recurrenceAnchorValue'
	>;

	let {
		value = {
			isRecurring: false,
			recurrenceUnit: null,
			recurrenceInterval: null,
			recurrenceAnchor: null,
			recurrenceAnchorValue: null
		},
		userDefault = null,
		idPrefix = 'rec'
	}: {
		value?: EditorValue;
		userDefault?: RecurrenceUnit | null;
		idPrefix?: string;
	} = $props();

	const locale = getLocale();

	// Capture prop values once at mount — this editor is keyed by reminder
	// id in the parent, so prop drift after init is not a concern. untrack
	// keeps Svelte from flagging the reads as missing reactivity.
	const initial = untrack(() => {
		const initialUnit: RecurrenceUnit = value.recurrenceUnit ?? userDefault ?? 'day';
		const initialInterval = value.recurrenceInterval ?? (initialUnit === 'day' ? 30 : 1);
		const initialAnchor: RecurrenceAnchor = value.recurrenceAnchor ?? 'interval';
		const yearUnpacked =
			initialAnchor === 'day_of_year' && value.recurrenceAnchorValue != null
				? unpackMonthDay(value.recurrenceAnchorValue)
				: { monthIdx: 0, day: 1 };
		return {
			isRecurring: value.isRecurring,
			unit: initialUnit,
			interval: initialInterval,
			anchor: initialAnchor,
			weekday:
				initialAnchor === 'day_of_week' && value.recurrenceAnchorValue != null
					? value.recurrenceAnchorValue
					: 1,
			dayOfMonth:
				initialAnchor === 'day_of_month' && value.recurrenceAnchorValue != null
					? value.recurrenceAnchorValue
					: 1,
			yearMonth: yearUnpacked.monthIdx + 1,
			yearDay: yearUnpacked.day
		};
	});

	let isRecurring = $state(initial.isRecurring);
	let unit = $state<RecurrenceUnit>(initial.unit);
	let interval = $state<number>(initial.interval);
	let anchor = $state<RecurrenceAnchor>(initial.anchor);
	let weekday = $state<number>(initial.weekday);
	let dayOfMonth = $state<number>(initial.dayOfMonth);
	let yearMonth = $state<number>(initial.yearMonth);
	let yearDay = $state<number>(initial.yearDay);

	// Reset anchor to 'interval' when switching to a unit that doesn't support
	// the currently selected anchor.
	$effect(() => {
		if (unit === 'day' && anchor !== 'interval') anchor = 'interval';
		if (unit === 'week' && anchor !== 'interval' && anchor !== 'day_of_week') anchor = 'interval';
		if (unit === 'month' && anchor !== 'interval' && anchor !== 'day_of_month') anchor = 'interval';
		if (unit === 'year' && anchor !== 'interval' && anchor !== 'day_of_year') anchor = 'interval';
	});

	const intervalMax = $derived(RECURRENCE_INTERVAL_MAX[unit]);

	// Clamp interval to the active unit's cap when switching units, so a
	// "365 days" carry-over doesn't sit above the "10 years" limit.
	$effect(() => {
		if (interval > intervalMax) interval = intervalMax;
	});

	const weekdayKeys = [
		'page.reminders.weekdaySun',
		'page.reminders.weekdayMon',
		'page.reminders.weekdayTue',
		'page.reminders.weekdayWed',
		'page.reminders.weekdayThu',
		'page.reminders.weekdayFri',
		'page.reminders.weekdaySat'
	] as const;
</script>

<label class="flex items-center gap-2 cursor-pointer">
	<input
		id="{idPrefix}-isRecurring"
		type="checkbox"
		name="isRecurring"
		bind:checked={isRecurring}
		class="rounded border-input"
	/>
	<span class="text-sm text-foreground">{t(locale, 'page.reminders.labelRecurring')}</span>
</label>

{#if isRecurring}
	<div class="space-y-3 animate-slide-up">
		<div class="flex flex-wrap items-end gap-3">
			<div class="space-y-1.5">
				<Label for="{idPrefix}-recurrenceInterval"
					>{t(locale, 'page.reminders.labelRepeatEvery')}</Label
				>
				<Input
					id="{idPrefix}-recurrenceInterval"
					name="recurrenceInterval"
					type="number"
					min="1"
					max={intervalMax}
					class="max-w-[100px]"
					value={interval}
					oninput={(e: Event) => {
						interval = parseInt((e.target as HTMLInputElement).value, 10) || 1;
					}}
					required
					autocomplete="off"
				/>
			</div>
			<div class="space-y-1.5">
				<Label for="{idPrefix}-recurrenceUnit" class="sr-only"
					>{t(locale, 'page.reminders.labelRecurrenceUnit')}</Label
				>
				<Select
					id="{idPrefix}-recurrenceUnit"
					name="recurrenceUnit"
					value={unit}
					onchange={(e: Event) => {
						unit = (e.target as HTMLSelectElement).value as RecurrenceUnit;
					}}
					class="max-w-[140px]"
				>
					<option value="day" selected={unit === 'day'}
						>{t(locale, 'page.reminders.unitDay')}</option
					>
					<option value="week" selected={unit === 'week'}
						>{t(locale, 'page.reminders.unitWeek')}</option
					>
					<option value="month" selected={unit === 'month'}
						>{t(locale, 'page.reminders.unitMonth')}</option
					>
					<option value="year" selected={unit === 'year'}
						>{t(locale, 'page.reminders.unitYear')}</option
					>
				</Select>
			</div>
		</div>

		{#if unit === 'week'}
			<div class="space-y-1.5">
				<Label>{t(locale, 'page.reminders.anchorWeekLabel')}</Label>
				<div class="flex flex-wrap gap-1">
					<input type="hidden" name="recurrenceAnchor" value={anchor} />
					{#if anchor === 'day_of_week'}
						<input type="hidden" name="recurrenceAnchorValue" value={weekday} />
					{/if}
					{#each weekdayKeys as key, idx (key)}
						<button
							type="button"
							class="px-2 py-1 text-xs rounded border {anchor === 'day_of_week' && weekday === idx
								? 'bg-primary text-primary-foreground border-primary'
								: 'border-input hover:bg-accent'}"
							onclick={() => {
								if (anchor === 'day_of_week' && weekday === idx) {
									anchor = 'interval';
								} else {
									anchor = 'day_of_week';
									weekday = idx;
								}
							}}
						>
							{t(locale, key)}
						</button>
					{/each}
				</div>
			</div>
		{:else if unit === 'month'}
			<div class="space-y-2">
				<input type="hidden" name="recurrenceAnchor" value={anchor} />
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input
						type="radio"
						name="{idPrefix}-monthAnchor"
						checked={anchor === 'interval'}
						onchange={() => (anchor = 'interval')}
					/>
					<span>{t(locale, 'page.reminders.anchorMonthFromDueDate')}</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input
						type="radio"
						name="{idPrefix}-monthAnchor"
						checked={anchor === 'day_of_month'}
						onchange={() => (anchor = 'day_of_month')}
					/>
					<span>{t(locale, 'page.reminders.anchorMonthSpecificDay')}</span>
				</label>
				{#if anchor === 'day_of_month'}
					<div class="ml-6 space-y-1.5">
						<Label for="{idPrefix}-dayOfMonth">{t(locale, 'page.reminders.anchorMonthLabel')}</Label
						>
						<Input
							id="{idPrefix}-dayOfMonth"
							name="recurrenceAnchorValue"
							type="number"
							min="1"
							max="31"
							class="max-w-[100px]"
							value={dayOfMonth}
							oninput={(e: Event) => {
								dayOfMonth = parseInt((e.target as HTMLInputElement).value, 10) || 1;
							}}
							required
						/>
						<p class="text-xs text-muted-foreground">
							{t(locale, 'page.reminders.anchorMonthClampWarning')}
						</p>
					</div>
				{/if}
			</div>
		{:else if unit === 'year'}
			<div class="space-y-2">
				<input type="hidden" name="recurrenceAnchor" value={anchor} />
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input
						type="radio"
						name="{idPrefix}-yearAnchor"
						checked={anchor === 'interval'}
						onchange={() => (anchor = 'interval')}
					/>
					<span>{t(locale, 'page.reminders.anchorYearFromDueDate')}</span>
				</label>
				<label class="flex items-center gap-2 cursor-pointer text-sm">
					<input
						type="radio"
						name="{idPrefix}-yearAnchor"
						checked={anchor === 'day_of_year'}
						onchange={() => (anchor = 'day_of_year')}
					/>
					<span>{t(locale, 'page.reminders.anchorYearSpecific')}</span>
				</label>
				{#if anchor === 'day_of_year'}
					<div class="ml-6 flex flex-wrap gap-3 items-end">
						<div class="space-y-1.5">
							<Label for="{idPrefix}-yearMonth">{t(locale, 'page.reminders.anchorYearMonth')}</Label
							>
							<Input
								id="{idPrefix}-yearMonth"
								name="recurrenceAnchorMonth"
								type="number"
								min="1"
								max="12"
								class="max-w-[100px]"
								value={yearMonth}
								oninput={(e: Event) => {
									yearMonth = parseInt((e.target as HTMLInputElement).value, 10) || 1;
								}}
								required
							/>
						</div>
						<div class="space-y-1.5">
							<Label for="{idPrefix}-yearDay">{t(locale, 'page.reminders.anchorYearDay')}</Label>
							<Input
								id="{idPrefix}-yearDay"
								name="recurrenceAnchorDay"
								type="number"
								min="1"
								max="31"
								class="max-w-[100px]"
								value={yearDay}
								oninput={(e: Event) => {
									yearDay = parseInt((e.target as HTMLInputElement).value, 10) || 1;
								}}
								required
							/>
						</div>
						<p class="text-xs text-muted-foreground w-full">
							{t(locale, 'page.reminders.anchorYearLeapWarning')}
						</p>
					</div>
				{/if}
			</div>
		{:else}
			<input type="hidden" name="recurrenceAnchor" value="interval" />
		{/if}
	</div>
{/if}
