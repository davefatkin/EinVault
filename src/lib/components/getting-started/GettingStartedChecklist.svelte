<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import { Check, ChevronDown, SquareCheckBig, X } from '@lucide/svelte';
	import { Card } from '#lib/components/ui/card/index.js';
	import { t, getLocale } from '#lib/i18n/index.js';
	import { cn } from '#lib/utils.js';
	import {
		GETTING_STARTED_STEPS,
		MEDICATION_SUBSTEPS,
		currentStep,
		gettingStartedHref,
		namedReminderHref,
		reminderToName,
		stepTarget,
		type GettingStartedStep,
		type GettingStartedTarget,
		type GettingStartedView,
		type MedicationSubStep
	} from '#lib/gettingStarted.js';
	import GettingStartedPetLinks from './GettingStartedPetLinks.svelte';

	// `companionId` is set on a pet's dashboard: links go to that pet. Without it
	// (the household page) the current step offers one button per pet in `pets`.
	let {
		view,
		pets,
		companionId,
		today,
		isAdmin,
		class: className
	}: {
		view: GettingStartedView;
		pets: { id: string; name: string }[];
		companionId?: string;
		today: string;
		isAdmin: boolean;
		class?: string;
	} = $props();

	const locale = getLocale();
	const uid = $props.id();
	// "quick logs, journal, health": a plain list, no "and".
	const listFormat = new Intl.ListFormat(locale, { type: 'unit', style: 'short' });
	const total = GETTING_STARTED_STEPS.length;

	let hidden = $state(false);
	let foldOpen = $state(false);

	const progress = $derived(view.progress);
	const current = $derived(currentStep(progress));
	const doneSteps = $derived(GETTING_STARTED_STEPS.filter((s) => progress.done[s]));
	const openSteps = $derived(GETTING_STARTED_STEPS.filter((s) => !progress.done[s]));
	const subtitle = $derived(
		view.mode === 'allSet'
			? t(locale, 'gettingStarted.allSet')
			: progress.doneCount === total - 1
				? t(locale, 'gettingStarted.subtitleOneLeft')
				: t(locale, 'gettingStarted.subtitle')
	);
	const foldLabel = $derived(
		t(locale, 'gettingStarted.doneFold', {
			count: doneSteps.length,
			list: listFormat.format(doneSteps.map((s) => t(locale, `gettingStarted.short.${s}` as const)))
		})
	);

	const named = $derived(reminderToName(progress));

	/** One link for the target, or null on the household page (per-pet buttons instead). */
	function linkFor(target: GettingStartedTarget): string | null {
		if (target === 'reminder' && named) return namedReminderHref(named);
		return companionId ? gettingStartedHref(target, companionId, today) : null;
	}

	function subLabel(sub: MedicationSubStep): string {
		if (sub === 'reminder' && named) {
			return t(locale, 'gettingStarted.sub.reminderNamed', { name: named.name });
		}
		return t(locale, `gettingStarted.sub.${sub}` as const);
	}

	const stepTitle = (s: GettingStartedStep) => t(locale, `gettingStarted.step.${s}` as const);

	// The Settings action answers without a redirect; skipping update() keeps the page as is.
	const hideCard: SubmitFunction =
		() =>
		async ({ result }) => {
			if (result.type === 'success') hidden = true;
		};
</script>

{#snippet doneMark()}
	<span
		role="img"
		aria-label={t(locale, 'gettingStarted.done')}
		class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-teal text-teal-foreground"
	>
		<Check class="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
	</span>
{/snippet}

{#snippet openMark(active: boolean, dashed = false)}
	<span
		aria-hidden="true"
		class={cn(
			'mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2',
			active ? 'border-teal/50' : 'border-border',
			dashed && 'border-dashed'
		)}
	>
		{#if active}<span class="h-2 w-2 rounded-full bg-teal"></span>{/if}
	</span>
{/snippet}

{#if !hidden}
	<Card data-testid="getting-started" class={cn('max-w-[42rem] px-4 pt-4 pb-2.5', className)}>
		<section aria-labelledby="{uid}-title">
			<div class="flex items-start gap-2.5">
				<span
					class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
					aria-hidden="true"
				>
					<SquareCheckBig class="h-[18px] w-[18px]" />
				</span>
				<div class="min-w-0 flex-1">
					<h2 id="{uid}-title" class="font-display text-lg leading-tight font-bold text-foreground">
						{t(locale, 'gettingStarted.title')}
					</h2>
					<p class="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
				</div>
				<form
					method="POST"
					action="/settings?/gettingStartedHide"
					use:enhance={hideCard}
					class="-mt-2.5 -mr-2.5 shrink-0"
				>
					<button
						type="submit"
						aria-label={t(locale, 'gettingStarted.hide')}
						class="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
					>
						<X class="h-[18px] w-[18px]" />
					</button>
				</form>
			</div>

			<div class="mt-2.5 mb-1.5 flex items-center gap-2">
				<div
					role="progressbar"
					aria-labelledby="{uid}-title"
					aria-valuemin={0}
					aria-valuemax={total}
					aria-valuenow={progress.doneCount}
					class="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
				>
					<div
						class="h-full rounded-full bg-teal transition-[width]"
						style="width: {(progress.doneCount / total) * 100}%"
					></div>
				</div>
				<span class="text-[11px] font-semibold text-muted-foreground tabular-nums">
					{t(locale, 'gettingStarted.progress', { done: progress.doneCount })}
				</span>
			</div>

			<ul class="text-[13px]">
				{#if doneSteps.length === 1}
					<li
						data-testid="getting-started-done"
						class="flex min-h-11 items-center gap-2.5 text-muted-foreground"
					>
						{@render doneMark()}
						<span data-struck class="line-through">{stepTitle(doneSteps[0])}</span>
					</li>
				{:else if doneSteps.length > 1}
					<li data-testid="getting-started-done">
						<button
							type="button"
							aria-expanded={foldOpen}
							aria-controls="{uid}-done"
							onclick={() => (foldOpen = !foldOpen)}
							class="flex min-h-11 w-full items-center gap-2.5 rounded-lg text-left text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
						>
							{@render doneMark()}
							<span class="min-w-0 flex-1">{foldLabel}</span>
							<ChevronDown
								class={cn('h-4 w-4 shrink-0 transition-transform', foldOpen && 'rotate-180')}
								aria-hidden="true"
							/>
						</button>
						<ul
							id="{uid}-done"
							hidden={!foldOpen}
							class="space-y-1 pb-2 pl-8 text-muted-foreground"
						>
							{#each doneSteps as step (step)}
								<li><span data-struck class="line-through">{stepTitle(step)}</span></li>
							{/each}
						</ul>
					</li>
				{/if}

				{#each openSteps as step (step)}
					{@const active = current?.step === step}
					{@const titleHref =
						active && step === 'medication' ? null : linkFor(stepTarget(progress, step))}
					<li
						class={cn(
							'relative flex items-start gap-2.5 py-2',
							active
								? '-mx-2.5 rounded-xl bg-teal/10 px-2.5'
								: 'border-t border-border/60 first:border-t-0'
						)}
					>
						{@render openMark(active)}
						<div class="min-w-0 flex-1">
							{#if titleHref}
								<!-- The link covers the whole row so the tap target is the row. -->
								<a
									href={titleHref}
									class="font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
								>
									{stepTitle(step)}
								</a>
							{:else}
								<p class="font-semibold text-foreground">{stepTitle(step)}</p>
							{/if}
							<p class="mt-0.5 text-xs text-muted-foreground">
								{t(locale, `gettingStarted.step.${step}Line` as const)}
								{#if step === 'quickLog'}
									<a
										href="/settings/quick-logs"
										class="relative z-10 font-medium text-primary-link underline-offset-2 hover:underline"
									>
										{t(locale, 'gettingStarted.quickLogSettings')}
									</a>
								{/if}
							</p>

							{#if active && step === 'medication'}
								<ol class="mt-1.5 text-xs">
									{#each MEDICATION_SUBSTEPS as sub (sub)}
										{@const subDone = progress.medication[sub]}
										{@const subActive = !subDone && current?.target === sub}
										{@const subHref = subActive ? linkFor(sub) : null}
										<li class="flex min-h-7 items-center gap-2">
											{#if subDone}
												<Check
													class="h-3.5 w-3.5 shrink-0 text-teal"
													strokeWidth={3}
													aria-hidden="true"
												/>
												<span class="sr-only">{t(locale, 'gettingStarted.done')}</span>
												<span data-struck class="text-muted-foreground line-through">
													{subLabel(sub)}
												</span>
											{:else}
												<span
													aria-hidden="true"
													class={cn(
														'h-3.5 w-3.5 shrink-0 rounded-full border-2',
														subActive ? 'border-teal/60' : 'border-border'
													)}
												></span>
												{#if subHref}
													<a
														href={subHref}
														class="flex min-h-11 flex-1 items-center font-semibold text-primary-link hover:underline"
													>
														{subLabel(sub)}
													</a>
												{:else}
													<span
														class={subActive
															? 'font-semibold text-foreground'
															: 'text-muted-foreground'}
													>
														{subLabel(sub)}
													</span>
												{/if}
											{/if}
										</li>
									{/each}
								</ol>
							{/if}

							{#if active && current && !linkFor(current.target)}
								<GettingStartedPetLinks target={current.target} {pets} {today} />
							{/if}
						</div>
					</li>
				{/each}

				{#if isAdmin && progress.caretaker !== null}
					<li
						data-testid="getting-started-caretaker"
						class="relative mt-1 flex items-start gap-2.5 border-t border-dashed border-border pt-2 pb-1"
					>
						{#if progress.caretaker}
							{@render doneMark()}
						{:else}
							{@render openMark(false, true)}
						{/if}
						<div class="min-w-0 flex-1">
							<p class="flex flex-wrap items-center gap-x-1.5 font-semibold">
								{#if progress.caretaker}
									<span data-struck class="text-muted-foreground line-through">
										{t(locale, 'gettingStarted.step.caretaker')}
									</span>
								{:else}
									<a
										href="/admin/users"
										class="text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
									>
										{t(locale, 'gettingStarted.step.caretaker')}
									</a>
								{/if}
								<span
									class="rounded-full bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground"
								>
									{t(locale, 'gettingStarted.optional')}
								</span>
							</p>
							{#if !progress.caretaker}
								<p class="mt-0.5 text-xs text-muted-foreground">
									{t(locale, 'gettingStarted.step.caretakerLine')}
								</p>
							{/if}
						</div>
					</li>
				{/if}
			</ul>
		</section>
	</Card>
{/if}
