<script lang="ts">
	// Printable caretaker sheet (#280), shared by /<id>/sheet and
	// /care/<id>/sheet. Read-only. Empty sections are left out entirely. The
	// Include checkboxes and the toolbar render only after hydration, so without
	// JavaScript the full sheet shows and the browser's own print works. Choices
	// live here and reset on reload: an excluded item stays on screen, dimmed
	// with a "Not printed" badge, and is print:hidden. Excluding a note or a
	// section hides its photos through the DOM without touching their own
	// checkboxes. The sheet uses no <nav>, <aside> or <header> elements (the
	// e2e print checks rely on that), and its images are not lazy-loaded, since
	// lazy images can be missing from a printout.
	import { onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { Printer, Video } from '@lucide/svelte';
	import CompanionAvatar from '$lib/components/CompanionAvatar.svelte';
	import LocalTime from '$lib/components/LocalTime.svelte';
	import NoteContent from '$lib/components/notes/NoteContent.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { renderMarkdown } from '$lib/markdown';
	import { noteMediaUrl } from '$lib/media';
	import { formatAge } from '$lib/age';
	import { sexLabel, speciesLabel, speciesLabels } from '$lib/i18n/labels';
	import { t, getLocale } from '$lib/i18n';
	import {
		photoSelection,
		sheetPhotoIds,
		type CaretakerSheet,
		type SheetMedia,
		type SheetSection
	} from '$lib/caretakerSheet';

	let {
		sheet,
		printedOn,
		shell
	}: {
		sheet: CaretakerSheet;
		printedOn: string;
		// The layout hosting the sheet; the sticky toolbar sits below its header.
		shell: 'app' | 'care';
	} = $props();
	const locale = getLocale();

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const excludedSections = new SvelteSet<SheetSection>();
	const excludedNotes = new SvelteSet<string>();
	const excludedOwners = new SvelteSet<string>();
	const excludedPhotos = new SvelteSet<string>();

	function setIncluded<T>(set: SvelteSet<T>, id: T, included: boolean) {
		if (included) set.delete(id);
		else set.add(id);
	}

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

	const photoIds = $derived(sheetPhotoIds(sheet));
	const photos = $derived(photoSelection(photoIds, excludedPhotos));
	function setAllPhotos(include: boolean) {
		if (include) excludedPhotos.clear();
		else for (const id of photoIds) excludedPhotos.add(id);
	}

	// A section whose items are all excluded prints no orphan heading.
	const householdPrinted = $derived(
		!excludedSections.has('household') && sheet.owners.some((o) => !excludedOwners.has(o.id))
	);
	const notesPrinted = $derived(
		!excludedSections.has('notes') && sheet.notes.some((n) => !excludedNotes.has(n.id))
	);

	function photoName(item: SheetMedia): string {
		return item.caption ?? item.originalName ?? t(locale, 'media.photoAlt');
	}

	// Literal class strings so Tailwind generates them. (app): below the h-14
	// mobile header, at the top on desktop. (caretaker): below the h-16 header.
	const TOOLBAR_TOP = {
		app: 'top-[calc(var(--demo-bar-h,0px)_+_3.5rem)] md:top-[var(--demo-bar-h,0px)]',
		care: 'top-[calc(var(--demo-bar-h,0px)_+_4rem)]'
	} as const;
</script>

{#snippet include(included: boolean, name: string, onchange: (included: boolean) => void)}
	{#if mounted}
		<span class="flex shrink-0 items-center gap-2 print:hidden">
			{#if !included}
				<Badge variant="coral">{t(locale, 'page.sheet.notPrinted')}</Badge>
			{/if}
			<label
				class="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground"
			>
				<input
					type="checkbox"
					class="h-4 w-4 accent-primary"
					checked={included}
					aria-label={t(locale, 'page.sheet.includeNamed', { name })}
					onchange={(e) => onchange(e.currentTarget.checked)}
				/>
				<span aria-hidden="true">{t(locale, 'page.sheet.include')}</span>
			</label>
		</span>
	{/if}
{/snippet}

{#snippet sectionHeading(section: SheetSection, title: string)}
	<div class="mb-3 flex items-center justify-between gap-3">
		<h2
			class="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase print:text-foreground"
		>
			{title}
		</h2>
		{@render include(!excludedSections.has(section), title, (v) =>
			setIncluded(excludedSections, section, v)
		)}
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
	{#if mounted}
		<div
			class="sticky z-30 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur print:hidden {TOOLBAR_TOP[
				shell
			]}"
		>
			<Button type="button" size="sm" onclick={() => window.print()}>
				<Printer class="mr-1.5 h-4 w-4" />
				{t(locale, 'page.sheet.print')}
			</Button>
			{#if photos.total > 0}
				<label class="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
					<input
						type="checkbox"
						class="h-4 w-4 accent-primary"
						bind:checked={() => photos.state === 'all', setAllPhotos}
						bind:indeterminate={() => photos.state === 'some', () => {}}
					/>
					{t(locale, 'page.sheet.includePhotos')}
				</label>
				<span class="text-xs text-muted-foreground">
					{t(
						locale,
						photos.total === 1
							? 'page.sheet.photosIncluded.one'
							: 'page.sheet.photosIncluded.other',
						{ n: photos.included, m: photos.total }
					)}
				</span>
			{/if}
		</div>
	{/if}

	<section class={['break-inside-avoid', excludedSections.has('header') && 'print:hidden']}>
		<div class="flex items-start gap-4">
			<div
				class={[
					'flex min-w-0 flex-1 items-start gap-4',
					excludedSections.has('header') && 'opacity-40'
				]}
			>
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
			{@render include(!excludedSections.has('header'), companion.name, (v) =>
				setIncluded(excludedSections, 'header', v)
			)}
		</div>
	</section>

	{#if sheet.emergency || sheet.vet}
		{@const off = excludedSections.has('contacts')}
		<section
			class={[
				'break-inside-avoid rounded-xl border border-border bg-card p-4',
				off && 'print:hidden'
			]}
		>
			{@render sectionHeading('contacts', t(locale, 'page.dashboard.caretaker.sectionContacts'))}
			<div class={['grid gap-4 sm:grid-cols-2 print:grid-cols-2', off && 'opacity-40']}>
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
		{@const off = excludedSections.has('household')}
		<section
			class={[
				'break-inside-avoid rounded-xl border border-border bg-card p-4',
				!householdPrinted && 'print:hidden'
			]}
		>
			{@render sectionHeading(
				'household',
				t(
					locale,
					sheet.owners.length === 1
						? 'page.dashboard.caretaker.householdOwner'
						: 'page.dashboard.caretaker.householdContacts'
				)
			)}
			<ul class={['space-y-3', off && 'opacity-40']}>
				{#each sheet.owners as owner (owner.id)}
					{@const ownerIn = !excludedOwners.has(owner.id)}
					<li class={['flex items-start justify-between gap-3', !ownerIn && 'print:hidden']}>
						<div class={['min-w-0 space-y-0.5', !ownerIn && 'opacity-40']}>
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
						{@render include(ownerIn, owner.displayName, (v) =>
							setIncluded(excludedOwners, owner.id, v)
						)}
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if hasRoutine}
		{@const off = excludedSections.has('routine')}
		<section class={['rounded-xl border border-border bg-card p-4', off && 'print:hidden']}>
			{@render sectionHeading('routine', t(locale, 'page.dashboard.caretaker.sectionSchedules'))}
			<div class={['space-y-4', off && 'opacity-40']}>
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
		{@const off = excludedSections.has('notes')}
		<section class={[!notesPrinted && 'print:hidden']}>
			{@render sectionHeading('notes', t(locale, 'page.sheet.sectionNotes'))}
			<div class={['space-y-3', off && 'opacity-40']}>
				{#each sheet.notes as note (note.id)}
					{@const noteIn = !excludedNotes.has(note.id)}
					{@const notePhotos = note.media.filter((m) => m.mediaType === 'photo')}
					{@const videos = note.media.filter((m) => m.mediaType === 'video')}
					<article
						class={[
							'break-inside-avoid rounded-xl border border-border bg-card p-4',
							!noteIn && 'print:hidden'
						]}
					>
						<div class="mb-2 flex items-start justify-between gap-3">
							<h3 class="font-display text-lg font-semibold break-words text-foreground">
								{note.title}
							</h3>
							{@render include(noteIn, note.title, (v) => setIncluded(excludedNotes, note.id, v))}
						</div>
						<div class={['space-y-3', !noteIn && 'opacity-40']}>
							<NoteContent {note} showTitle={false} />
							{#if notePhotos.length > 0}
								<div class="grid grid-cols-3 gap-2">
									{#each notePhotos as item (item.id)}
										{@const photoIn = !excludedPhotos.has(item.id)}
										<figure class={['relative break-inside-avoid', !photoIn && 'print:hidden']}>
											<img
												src={noteMediaUrl(companion.id, note.id, item)}
												alt={photoName(item)}
												class={[
													'aspect-[4/3] max-h-[45mm] w-full rounded-lg object-cover',
													!photoIn && 'opacity-40'
												]}
											/>
											{#if item.caption}
												<figcaption class="mt-1 text-xs break-words text-muted-foreground">
													{item.caption}
												</figcaption>
											{/if}
											{#if mounted}
												<label
													class="absolute top-1.5 left-1.5 flex items-center rounded-md bg-card/90 p-1 print:hidden"
												>
													<input
														type="checkbox"
														class="h-4 w-4 accent-primary"
														checked={photoIn}
														aria-label={t(locale, 'page.sheet.includePhoto', {
															name: photoName(item)
														})}
														onchange={(e) =>
															setIncluded(excludedPhotos, item.id, e.currentTarget.checked)}
													/>
												</label>
												{#if !photoIn}
													<Badge variant="coral" class="absolute top-1.5 right-1.5 print:hidden"
														>{t(locale, 'page.sheet.notPrinted')}</Badge
													>
												{/if}
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
