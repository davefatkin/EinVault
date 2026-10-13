<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { t, getLocale } from '$lib/i18n';
	import { healthTypeLabel } from '$lib/i18n/labels';

	// The journal day's "Link health event" form: a select of the companion's
	// events from other days.
	let {
		events,
		error = null,
		beforeSubmit,
		onclose
	}: {
		events: { id: string; type: string; title: string; day: string }[];
		error?: string | null;
		/** Runs before posting, e.g. to save pending journal text. */
		beforeSubmit: () => Promise<void>;
		onclose: () => void;
	} = $props();
	const locale = getLocale();
</script>

<form
	method="POST"
	action="?/linkHealth"
	use:enhance={async () => {
		await beforeSubmit();
		return async ({ result, update }) => {
			if (result.type === 'success') onclose();
			await update({ reset: false });
		};
	}}
	class="space-y-2 rounded-lg border border-border px-4 py-3 animate-slide-up"
>
	{#if events.length === 0}
		<p class="text-sm text-muted-foreground">{t(locale, 'page.journal.day.noLinkableEvents')}</p>
	{:else}
		<label for="link-health-event" class="text-xs font-medium text-muted-foreground"
			>{t(locale, 'page.journal.day.linkHealthEventLabel')}</label
		>
		<select
			id="link-health-event"
			name="healthEventId"
			required
			class="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
		>
			{#each events as ev (ev.id)}
				<option value={ev.id}>{healthTypeLabel(locale, ev.type)} · {ev.day} · {ev.title}</option>
			{/each}
		</select>
	{/if}
	{#if error}
		<p role="alert" class="text-sm text-destructive">{error}</p>
	{/if}
	<div class="flex gap-2">
		{#if events.length > 0}
			<Button type="submit" size="sm">{t(locale, 'page.journal.day.link')}</Button>
		{/if}
		<Button type="button" variant="outline" size="sm" onclick={onclose}
			>{t(locale, 'common.cancel')}</Button
		>
	</div>
</form>
