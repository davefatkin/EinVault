<script lang="ts">
	import { X, Undo2, CheckCheck, HeartPulse } from '@lucide/svelte';
	import { pauseToast, resumeToast, removeToast, undoToast, type Toast } from './toastStore.svelte';

	let { toast }: { toast: Toast } = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			// For pending-action toasts, Esc means "cancel" (Undo). For confirmation
			// toasts (no onUndo), Esc just dismisses the message.
			if (toast.onUndo) {
				undoToast(toast.id);
			} else {
				removeToast(toast.id);
			}
		}
	}

	function fire(cb: (() => void) | undefined) {
		if (!cb) return;
		removeToast(toast.id);
		cb();
	}

	const hasActions = $derived(!!toast.onUndo || !!toast.onCommit || !!toast.onLogEvent);
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	role="status"
	data-toast-id={toast.id}
	onmouseenter={() => pauseToast(toast.id)}
	onmouseleave={() => resumeToast(toast.id)}
	onfocusin={() => pauseToast(toast.id)}
	onfocusout={() => resumeToast(toast.id)}
	onkeydown={handleKeydown}
	class="toast-item relative overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-lg p-3 w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
>
	<div class="flex items-center gap-3">
		<div class="flex-1 min-w-0">
			<p class="text-sm font-medium text-foreground truncate">{toast.title}</p>
			{#if toast.description}
				<p class="text-xs mt-0.5 text-muted-foreground">{toast.description}</p>
			{/if}
		</div>
		{#if !hasActions}
			<button
				type="button"
				onclick={() => removeToast(toast.id)}
				aria-label={toast.dismissLabel ?? 'Dismiss'}
				class="inline-flex items-center justify-center rounded-lg h-7 w-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
			>
				<X class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>
	{#if hasActions}
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
			{#if toast.onCommit}
				<button
					type="button"
					onclick={() => fire(toast.onCommit)}
					class="inline-flex items-center gap-1 rounded-lg h-8 px-2.5 text-xs font-medium whitespace-nowrap border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
				>
					<CheckCheck class="h-3.5 w-3.5 shrink-0" />
					<span>{toast.commitLabel ?? 'Done'}</span>
				</button>
			{/if}
			{#if toast.onLogEvent}
				<button
					type="button"
					onclick={() => fire(toast.onLogEvent)}
					class="inline-flex items-center gap-1 rounded-lg h-8 px-2.5 text-xs font-medium whitespace-nowrap border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
				>
					<HeartPulse class="h-3.5 w-3.5 shrink-0" />
					<span>{toast.logEventLabel ?? 'Done & Log Event'}</span>
				</button>
			{/if}
			{#if toast.onUndo}
				<button
					type="button"
					data-toast-action="undo"
					onclick={() => undoToast(toast.id)}
					aria-label={toast.undoLabel ?? 'Undo'}
					class="ms-auto inline-flex items-center gap-1 rounded-lg h-8 px-2.5 text-xs font-medium whitespace-nowrap text-primary hover:bg-accent transition-colors"
				>
					<Undo2 class="h-3.5 w-3.5 shrink-0" />
					<span>{toast.undoLabel ?? 'Undo'}</span>
				</button>
			{/if}
		</div>
	{/if}
	{#if toast.progress && toast.durationMs > 0}
		<span
			class="toast-dismiss-countdown absolute bottom-0 left-0 h-0.5 bg-primary/70"
			style="--dismiss-ms: {toast.durationMs}ms"
			aria-hidden="true"
		></span>
	{/if}
</div>
