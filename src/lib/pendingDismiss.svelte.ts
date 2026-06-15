import { t, type Locale } from '$lib/i18n';
import { addToast, removeToast, suppressNextPause } from '$lib/components/ui/toast';

export const DISMISS_DELAY_MS = 7000;

const IMMEDIATE_CONFIRM_MS = 2500;

type PendingEntry = {
	form: HTMLFormElement;
	toastId: string;
};

/**
 * Per-component reactive store for the "pending dismiss" UX. Each call creates
 * an isolated state scope. Clicking dismiss delays the server submit by
 * `delayMs` and shows a toast with Undo at the bottom of the viewport. Undo
 * cancels the timer; no server call ever happens.
 *
 * `getDelayMs()` returns the current undo window in milliseconds. A value of 0
 * means no undo window: `queue()` submits immediately and shows a brief
 * confirmation toast.
 *
 * IMPORTANT: `getLocale` is invoked from event handlers (click, focus, etc.)
 * AFTER component setup. Do not pass the raw `getLocale` from `$lib/i18n`,
 * which calls `getContext` and throws `lifecycle_outside_component` when run
 * outside setup. Cache the locale in your component (`const locale =
 * getLocale();`) and pass `() => locale` instead.
 */
export function createPendingDismissals(
	getLocale: () => Locale,
	getDelayMs: () => number = () => DISMISS_DELAY_MS
) {
	const pending: Record<string, PendingEntry> = {};

	// Idempotency guard for form submission. `dataset.submitting` is set to '1'
	// on the first call and never cleared: the form node is unmounted by the
	// redirect that follows the submission, so the flag is naturally GC'd with
	// the DOM. Multiple paths can race to submit the same form (e.g. the toast
	// onExpire firing in the same tick as a user click); the second call is a
	// no-op.
	function safeSubmit(form: HTMLFormElement) {
		if (form.dataset.submitting === '1') return false;
		form.dataset.submitting = '1';
		form.requestSubmit();
		return true;
	}

	function submitNow(id: string) {
		const entry = pending[id];
		if (!entry) return;
		delete pending[id];
		if (!entry.form.isConnected) return;
		safeSubmit(entry.form);
	}

	// `requestSubmit()` dispatches the submit event synchronously, so SvelteKit's
	// `use:enhance` captures the FormData before this function returns. The
	// hidden `andEvent` input is freshly created on every call and removed right
	// after submission so the DOM stays clean and a possible re-submit of the
	// same form cannot silently carry `andEvent=1` a second time.
	function submitFormWithEvent(form: HTMLFormElement) {
		if (!form.isConnected) return;
		const flag = document.createElement('input');
		flag.type = 'hidden';
		flag.name = 'andEvent';
		flag.value = '1';
		form.appendChild(flag);
		if (!safeSubmit(form)) {
			flag.remove();
			return;
		}
		flag.remove();
	}

	function submitWithEvent(id: string) {
		const entry = pending[id];
		if (!entry) return;
		delete pending[id];
		submitFormWithEvent(entry.form);
	}

	function commitWithEvent(id: string, form: HTMLFormElement) {
		const entry = pending[id];
		if (entry) {
			removeToast(entry.toastId);
			delete pending[id];
		}
		submitFormWithEvent(form);
	}

	function queue(
		id: string,
		form: HTMLFormElement,
		title: string,
		opts?: { allowLogEvent?: boolean }
	) {
		const delayMs = getDelayMs();
		const locale = getLocale();
		const announcement = t(locale, 'common.reminder.dismissedAnnounce', { title });

		if (delayMs <= 0) {
			safeSubmit(form);
			addToast({
				title: announcement,
				durationMs: IMMEDIATE_CONFIRM_MS,
				dismissLabel: t(locale, 'common.reminder.toastDismiss')
			});
			return;
		}

		const existing = pending[id];
		if (existing) {
			removeToast(existing.toastId);
		}

		const toastId = addToast({
			title: announcement,
			durationMs: delayMs,
			undoLabel: t(locale, 'common.reminder.toastUndoLabel'),
			commitLabel: t(locale, 'common.reminder.done'),
			logEventLabel: t(locale, 'common.reminder.logEvent'),
			dismissLabel: t(locale, 'common.reminder.toastDismiss'),
			onUndo: () => undo(id),
			onExpire: () => submitNow(id),
			onCommit: () => submitNow(id),
			onLogEvent: opts?.allowLogEvent ? () => submitWithEvent(id) : undefined
		});
		pending[id] = { form, toastId };

		// Focus the Undo button so keyboard users can reach it before the timer
		// expires. Without this, dashboard pages place focus far from the toast
		// region and the undo window can lapse before tab-navigation arrives.
		// Stealing focus is the lesser evil. Two rAFs: one to let the toast store
		// commit, the next to wait for the Toast component to mount in the DOM.
		if (typeof requestAnimationFrame !== 'undefined') {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// Only steal focus when nothing meaningful is focused. A user who
					// has already Tab'd to another control or typed into an input
					// keeps their place; the toast is still reachable via Tab.
					const active = document.activeElement;
					if (active && active !== document.body && active.tagName !== 'HTML') return;
					const root = document.querySelector<HTMLElement>(`[data-toast-id="${toastId}"]`);
					const btn = root?.querySelector<HTMLButtonElement>('button[data-toast-action="undo"]');
					if (!btn) return;
					// Stealing focus into the toast would otherwise pause the countdown two
					// ways: the JS timer via `focusin` and the CSS bar via `:focus-within`.
					// Neither should happen for a programmatic focus — the window should
					// keep ticking. Suppress the JS pause and exempt this toast from the
					// CSS focus pause (genuine hover still pauses both).
					suppressNextPause(toastId);
					root?.classList.add('no-focus-pause');
					btn.focus();
				});
			});
		}
	}

	function undo(id: string) {
		const entry = pending[id];
		if (!entry) return;
		removeToast(entry.toastId);
		delete pending[id];
	}

	function cleanup() {
		for (const id of Object.keys(pending)) {
			removeToast(pending[id].toastId);
		}
		for (const k of Object.keys(pending)) delete pending[k];
	}

	return {
		queue,
		commitWithEvent,
		undo,
		cleanup
	};
}
