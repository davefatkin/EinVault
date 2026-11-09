<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import LocalTime from '#lib/components/LocalTime.svelte';
	import { t, getLocale } from '#lib/i18n/index.js';

	// A list of things to link, one POST form per row. Used inline in the Health
	// Log modal (incidents for an event) and inside a dialog on the incident
	// page (health events for an incident); the caller names the action and the
	// field that carries the picked id.
	let {
		items,
		action,
		idField,
		fields = {},
		emptyText,
		onlinked
	}: {
		items: { id: string; label: string; badge?: string; date?: Date | string }[];
		action: string;
		idField: string;
		/** Extra hidden fields posted with every row (the other side of the link). */
		fields?: Record<string, string>;
		emptyText: string;
		onlinked?: () => void;
	} = $props();
	const locale = getLocale();

	let busy = $state(false);
	let error = $state<string | null>(null);

	const submit: SubmitFunction = () => {
		busy = true;
		error = null;
		return async ({ result, update }) => {
			busy = false;
			if (result.type === 'failure') {
				const data = result.data as { error?: string; healthError?: string } | undefined;
				error = data?.error ?? data?.healthError ?? t(locale, 'media.actionFailed');
				return;
			}
			await update();
			if (result.type === 'success') onlinked?.();
		};
	};
</script>

{#if error}<p role="alert" class="mb-2 text-sm text-destructive">{error}</p>{/if}
{#if items.length === 0}
	<p class="text-sm text-muted-foreground">{emptyText}</p>
{:else}
	<ul class="max-h-72 space-y-1.5 overflow-y-auto">
		{#each items as item (item.id)}
			<li>
				<form method="POST" {action} use:enhance={submit}>
					{#each Object.entries(fields) as [name, value] (name)}
						<input type="hidden" {name} {value} />
					{/each}
					<input type="hidden" name={idField} value={item.id} />
					<button
						type="submit"
						disabled={busy}
						class="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
					>
						<span class="font-medium break-words">{item.label}</span>
						{#if item.badge}
							<span class="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
								>{item.badge}</span
							>
						{/if}
						{#if item.date}
							<span class="text-xs text-muted-foreground"><LocalTime date={item.date} /></span>
						{/if}
					</button>
				</form>
			</li>
		{/each}
	</ul>
{/if}
