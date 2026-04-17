import { t, type Locale } from '$lib/i18n';

export const DISMISS_DELAY_MS = 5000;

/**
 * Svelte action that registers a list-row form in a Map keyed by reminder id.
 * Lets the modal's Done button look up the corresponding list-row form so
 * pending-dismiss timers survive modal close.
 */
export function registerDismissForm(
	node: HTMLFormElement,
	{ id, registry }: { id: string; registry: Map<string, HTMLFormElement> }
) {
	registry.set(id, node);
	return {
		destroy() {
			if (registry.get(id) === node) registry.delete(id);
		}
	};
}

type PendingEntry = { timer: ReturnType<typeof setTimeout>; form: HTMLFormElement };

/**
 * Per-component reactive store for the "pending dismiss" UX
 * (see GitHub issue #32). Each call creates an isolated state scope.
 *
 * Pattern: clicking dismiss delays the server submit by DISMISS_DELAY_MS
 * and shows an in-row Undo button. Undo cancels the timer. No server
 * call ever happens.
 */
export function createPendingDismissals(locale: Locale) {
	let pending = $state<Record<string, PendingEntry>>({});
	let order: string[] = [];
	let announcement = $state('');

	function queue(id: string, form: HTMLFormElement, title: string) {
		const existing = pending[id];
		if (existing) clearTimeout(existing.timer);
		const timer = setTimeout(() => {
			delete pending[id];
			order = order.filter((x) => x !== id);
			form.requestSubmit();
		}, DISMISS_DELAY_MS);
		pending[id] = { timer, form };
		order = [...order.filter((x) => x !== id), id];
		announcement = t(locale, 'page.dashboard.reminderDismissedAnnounce', { title });
	}

	function undo(id: string, title: string) {
		const entry = pending[id];
		if (!entry) return;
		clearTimeout(entry.timer);
		delete pending[id];
		order = order.filter((x) => x !== id);
		announcement = t(locale, 'page.dashboard.reminderRestoredAnnounce', { title });
	}

	function isPending(id: string): boolean {
		return !!pending[id];
	}

	/**
	 * Undo the most-recently queued dismissal. Returns true if one was undone.
	 * Caller provides a title lookup since reminders may live anywhere.
	 */
	function undoLast(titleForId: (id: string) => string | undefined): boolean {
		if (order.length === 0) return false;
		const id = order[order.length - 1];
		const title = titleForId(id);
		if (title === undefined) return false;
		undo(id, title);
		return true;
	}

	return {
		get announcement() {
			return announcement;
		},
		isPending,
		queue,
		undo,
		undoLast
	};
}
