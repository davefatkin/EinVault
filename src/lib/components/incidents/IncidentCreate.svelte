<script lang="ts">
	import { goto } from '$app/navigation';
	import { Bandage, ChevronLeft } from '@lucide/svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import IncidentCreateForm from './IncidentCreateForm.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';

	// The new-incident screen, shared by the owner Health page and the caretaker
	// care page. The form and its save-then-upload flow are IncidentCreateForm.
	let {
		companionId,
		backHref,
		backLabel,
		nextHref,
		allowStart,
		showReminder = false,
		uploadMaxMb,
		videoMaxMb,
		formError
	}: {
		companionId: string;
		backHref: string;
		backLabel: string;
		/** Where to go once the incident and its files are saved. */
		nextHref: (id: string) => string;
		/** Owners set the start; caretakers log "now". */
		allowStart: boolean;
		showReminder?: boolean;
		uploadMaxMb: number;
		videoMaxMb: number;
		/** The action's error when the form was posted without JavaScript. */
		formError?: string | null;
	} = $props();
	const locale = getLocale();
</script>

<div class="mx-auto max-w-3xl space-y-6 pb-20 md:pb-0">
	<a
		href={backHref}
		class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
	>
		<ChevronLeft class="h-4 w-4" />
		{backLabel}
	</a>
	<PageHeader title={t(locale, 'page.incident.newTitle')} tint="teal">
		{#snippet icon()}<Bandage class="h-5 w-5" />{/snippet}
	</PageHeader>
	<IncidentCreateForm
		{companionId}
		{nextHref}
		{allowStart}
		{showReminder}
		{uploadMaxMb}
		{videoMaxMb}
		{formError}
		onfinish={(url) => goto(url)}
		oncancel={() => goto(backHref)}
	/>
</div>
