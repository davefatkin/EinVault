<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import { tick } from 'svelte';
	import { t, getLocale } from '$lib/i18n';

	interface Props {
		open: boolean;
		message: string;
		confirmLabel?: string;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let { open, message, confirmLabel, onconfirm, oncancel }: Props = $props();
	const locale = getLocale();

	let dialogEl = $state<HTMLElement | null>(null);
	let triggerEl = $state<HTMLElement | null>(null);
	const messageId = `confirm-msg-${Math.random().toString(36).slice(2)}`;

	$effect(() => {
		if (open) {
			triggerEl = document.activeElement as HTMLElement | null;
			tick().then(() => {
				dialogEl?.querySelector<HTMLElement>('button')?.focus();
			});
		} else {
			tick().then(() => triggerEl?.focus());
		}
	});

	function trapFocus(e: KeyboardEvent) {
		if (!dialogEl) return;
		if (e.key === 'Escape') {
			oncancel();
			return;
		}
		if (e.key !== 'Tab') return;
		const focusable = Array.from(
			dialogEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		);
		const first = focusable[0];
		const last = focusable[focusable.length - 1];
		if (e.shiftKey) {
			if (document.activeElement === first) {
				e.preventDefault();
				last?.focus();
			}
		} else {
			if (document.activeElement === last) {
				e.preventDefault();
				first?.focus();
			}
		}
	}
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		role="presentation"
		onkeydown={trapFocus}
	>
		<!-- Backdrop -->
		<div
			role="presentation"
			class="absolute inset-0 bg-black/50"
			onclick={oncancel}
			onkeydown={() => {}}
		></div>

		<!-- Dialog -->
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby={messageId}
			class="relative z-10 w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-lg"
		>
			<p id={messageId} class="text-sm text-foreground">{message}</p>
			<div class="flex justify-end gap-2 mt-5">
				<Button variant="outline" size="sm" onclick={oncancel}
					>{t(locale, 'component.confirmDialog.cancel')}</Button
				>
				<Button variant="destructive" size="sm" onclick={onconfirm}
					>{confirmLabel ?? t(locale, 'component.confirmDialog.delete')}</Button
				>
			</div>
		</div>
	</div>
{/if}
