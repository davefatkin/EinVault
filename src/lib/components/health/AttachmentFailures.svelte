<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';
	import type { AttachFailure } from '#lib/healthAttachments.js';
	import { t, getLocale } from '#lib/i18n/index.js';

	// Shown after a health event was saved but some document changes failed.
	let {
		failures,
		reminderUrl = null,
		onclose
	}: {
		failures: AttachFailure[];
		reminderUrl?: string | null;
		onclose: () => void;
	} = $props();
	const locale = getLocale();

	let panel = $state<HTMLDivElement | undefined>(undefined);
	onMount(() => panel?.focus());
</script>

<div class="space-y-3 text-sm outline-none" tabindex="-1" bind:this={panel}>
	<p role="alert">{t(locale, 'attachments.failedTitle')}</p>
	<ul class="list-disc space-y-1 pl-5 text-destructive">
		{#each failures as f, i (i)}
			<li>{t(locale, 'attachments.itemFailed', { name: f.name, message: f.message })}</li>
		{/each}
	</ul>
	<div class="flex flex-wrap gap-3 pt-1">
		{#if reminderUrl}
			<Button onclick={() => reminderUrl && goto(reminderUrl)}
				>{t(locale, 'attachments.continueToReminder')}</Button
			>
		{/if}
		<Button variant="outline" onclick={onclose}>{t(locale, 'common.close')}</Button>
	</div>
</div>
