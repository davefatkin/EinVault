<script lang="ts">
	import Toast from './Toast.svelte';
	import { toasts } from './toastStore.svelte';

	let { ariaLabel }: { ariaLabel: string } = $props();

	const MAX_VISIBLE = 5;

	let visible = $derived(toasts.slice(-MAX_VISIBLE));
</script>

<!--
	`flex-col-reverse` is intentional: the newest toast renders at the bottom of
	the stack (closest to the viewport edge and the user's pointer), with older
	toasts stacking upward above it.
-->
<div
	role="region"
	aria-label={ariaLabel}
	class="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-4 sm:bottom-4 z-50 flex flex-col-reverse gap-2 p-3 sm:p-0 pointer-events-none items-center sm:items-end"
>
	{#each visible as toast (toast.id)}
		<div class="pointer-events-auto w-full max-w-sm">
			<Toast {toast} />
		</div>
	{/each}
</div>
