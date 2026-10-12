<script lang="ts">
	// Printable caretaker sheet (#280), shared by /<id>/sheet and
	// /care/<id>/sheet. Read-only. Empty sections are left out entirely. The
	// sheet uses no <nav>, <aside> or <header> elements (the e2e print checks
	// rely on that), and its images are not lazy-loaded, since lazy images can
	// be missing from a printout.
	import { Video } from '@lucide/svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import NoteContent from '$lib/components/notes/NoteContent.svelte';
	import { renderMarkdown } from '$lib/markdown';
	import { noteMediaUrl } from '$lib/media';
	import { formatAge } from '$lib/age';
	import { sexLabel, speciesLabel, speciesLabels } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';
	import type { CaretakerSheet, SheetMedia } from '$lib/caretakerSheet';

	let { sheet, printedOn }: { sheet: CaretakerSheet; printedOn: string } = $props();
	const locale = getLocale();

	const companion = $derived(sheet.companion);
	const labels = $derived(speciesLabels(locale, companion.species));
	const summary = $derived(
		[
			`${labels.icon} ${speciesLabel(locale, companion.species)}`,
			companion.breed,
			formatAge(companion.dob, locale),
			companion.sex ? sexLabel(locale, companion.sex) : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	const hasRoutine = $derived(
		!!(sheet.schedules.feeding || sheet.schedules.walk || sheet.schedules.medication)
	);

	function photoName(item: SheetMedia): string {
		return item.caption ?? item.originalName ?? t(locale, 'media.photoAlt');
	}
</script>

{#snippet sectionHeading(title: string)}
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2
			class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase print:text-foreground"
		>
			{title}
		</h2>
	</div>
{/snippet}

{#snippet phone(number: string)}
	<a href="tel:{number}" class="block text-lg font-semibold text-primary-link hover:underline"
		>{number}</a
	>
{/snippet}

{#snippet schedule(title: string, markdown: string)}
	<div class="break-inside-avoid">
		<h3 class="mb-1 text-xs font-semibold text-muted-foreground">{title}</h3>
		<div class="prose prose-sm dark:prose-invert max-w-none">
			{@html renderMarkdown(markdown)}
		</div>
	</div>
{/snippet}

<div
	class="mx-auto max-w-3xl space-y-5 print:max-w-none print:space-y-4 print:[&_a]:text-inherit print:[&_a]:no-underline"
>
	<section class="break-inside-avoid">
		<div class="flex items-start gap-4">
			<div class="flex min-w-0 flex-1 items-start gap-4">
				<!-- The no-photo fallback is a white initial on a gradient, and
				     browsers drop backgrounds in print. -->
				<CompanionAvatar
					companionId={companion.id}
					avatarPath={companion.avatarPath}
					name={companion.name}
					size="lg"
					class={companion.avatarPath ? '' : 'print:hidden'}
				/>
				<div class="min-w-0 flex-1">
					<h1 class="font-display text-2xl leading-tight font-bold text-foreground">
						{companion.name}
					</h1>
					<p class="mt-0.5 text-sm text-muted-foreground">{summary}</p>
					{#if companion.microchip}
						<p class="mt-1 text-xs text-muted-foreground">
							{t(locale, 'page.dashboard.caretaker.microchip', { id: companion.microchip })}
						</p>
					{/if}
					{#if sheet.latestWeight}
						<p class="mt-1 text-sm text-foreground">
							<span class="font-semibold"
								>{sheet.latestWeight.weight} {sheet.latestWeight.unit}</span
							>
							<span class="text-xs text-muted-foreground">
								· {t(locale, 'page.dashboard.caretaker.weightAsOf')}
								<LocalTime date={sheet.latestWeight.recordedAt} /></span
							>
						</p>
					{/if}
				</div>
			</div>
		</div>
	</section>

	{#if sheet.emergency || sheet.vet}
		<section class="break-inside-avoid rounded-xl border border-border bg-card p-4">
			{@render sectionHeading(t(locale, 'page.dashboard.caretaker.sectionContacts'))}
			<div class="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
				{#if sheet.emergency}
					<div class="space-y-1">
						<h3 class="text-xs font-semibold text-muted-foreground">
							{t(locale, 'page.dashboard.caretaker.cardEmergencyContact')}
						</h3>
						{#if sheet.emergency.name}
							<p class="font-medium text-foreground">{sheet.emergency.name}</p>
						{/if}
						{#if sheet.emergency.phone}{@render phone(sheet.emergency.phone)}{/if}
					</div>
				{/if}
				{#if sheet.vet}
					<div class="space-y-1">
						<h3 class="text-xs font-semibold text-muted-foreground">
							{t(locale, 'page.dashboard.caretaker.cardVetInfo')}
						</h3>
						{#if sheet.vet.name}<p class="font-medium text-foreground">{sheet.vet.name}</p>{/if}
						{#if sheet.vet.clinic}<p class="text-sm text-muted-foreground">
								{sheet.vet.clinic}
							</p>{/if}
						{#if sheet.vet.phone}{@render phone(sheet.vet.phone)}{/if}
					</div>
				{/if}
			</div>
		</section>
	{/if}

	{#if sheet.owners.length > 0}
		<section class="break-inside-avoid rounded-xl border border-border bg-card p-4">
			{@render sectionHeading(
				t(
					locale,
					sheet.owners.length === 1
						? 'page.dashboard.caretaker.householdOwner'
						: 'page.dashboard.caretaker.householdContacts'
				)
			)}
			<ul class="space-y-3">
				{#each sheet.owners as owner (owner.id)}
					<li class="flex items-start justify-between gap-3">
						<div class="min-w-0 space-y-0.5">
							<p class="font-semibold text-foreground">{owner.displayName}</p>
							{#if owner.phone}{@render phone(owner.phone)}{/if}
							{#if owner.email}
								<a
									href="mailto:{owner.email}"
									class="block text-sm break-all text-muted-foreground hover:underline"
									>{owner.email}</a
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if hasRoutine}
		<section class="rounded-xl border border-border bg-card p-4">
			{@render sectionHeading(t(locale, 'page.dashboard.caretaker.sectionSchedules'))}
			<div class="space-y-4">
				{#if sheet.schedules.feeding}
					{@render schedule(
						t(locale, 'page.dashboard.caretaker.cardFeeding'),
						sheet.schedules.feeding
					)}
				{/if}
				{#if sheet.schedules.walk}
					{@render schedule(labels.scheduleCardTitle, sheet.schedules.walk)}
				{/if}
				{#if sheet.schedules.medication}
					{@render schedule(
						t(locale, 'page.dashboard.caretaker.cardMedicationSchedule'),
						sheet.schedules.medication
					)}
				{/if}
			</div>
		</section>
	{/if}

	{#if sheet.notes.length > 0}
		<section>
			{@render sectionHeading(t(locale, 'page.sheet.sectionNotes'))}
			<div class="space-y-3">
				{#each sheet.notes as note (note.id)}
					{@const notePhotos = note.media.filter((m) => m.mediaType === 'photo')}
					{@const videos = note.media.filter((m) => m.mediaType === 'video')}
					<article class="break-inside-avoid rounded-xl border border-border bg-card p-4">
						<div class="mb-2 flex items-start justify-between gap-3">
							<h3 class="font-display text-lg font-semibold break-words text-foreground">
								{note.title}
							</h3>
						</div>
						<div class="space-y-3">
							<NoteContent {note} showTitle={false} />
							{#if notePhotos.length > 0}
								<div class="grid grid-cols-3 gap-2">
									{#each notePhotos as item (item.id)}
										<figure class="relative break-inside-avoid">
											<img
												src={noteMediaUrl(companion.id, note.id, item)}
												alt={photoName(item)}
												class="aspect-[4/3] max-h-[45mm] w-full rounded-lg object-cover"
											/>
											{#if item.caption}
												<figcaption class="mt-1 text-xs break-words text-muted-foreground">
													{item.caption}
												</figcaption>
											{/if}
										</figure>
									{/each}
								</div>
							{/if}
							{#each videos as item (item.id)}
								<p class="flex items-center gap-1.5 text-sm text-muted-foreground">
									<Video class="h-4 w-4 shrink-0" aria-hidden="true" />
									{t(locale, 'page.sheet.video')}
								</p>
							{/each}
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}

	<p
		class="border-t border-border pt-3 text-center text-xs text-muted-foreground print:text-foreground"
	>
		{t(locale, 'page.sheet.printedOn', { date: printedOn })}
	</p>
</div>
