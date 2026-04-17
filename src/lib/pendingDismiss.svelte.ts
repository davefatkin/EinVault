import { t, type Locale } from '$lib/i18n';

export const DISMISS_DELAY_MS = 7000;

type PendingEntry = {
	timer: ReturnType<typeof setTimeout>;
	form: HTMLFormElement;
	startedAt: number;
	remainingMs: number;
	paused: boolean;
};

/**
 * Per-component reactive store for the "pending dismiss" UX
 * (see GitHub issue #32). Each call creates an isolated state scope.
 *
 * Pattern: clicking dismiss delays the server submit by DISMISS_DELAY_MS
 * and shows an in-row Undo button. Undo cancels the timer. No server
 * call ever happens.
 */
export function createPendingDismissals(getLocale: () => Locale) {
	let pending = $state<Record<string, PendingEntry>>({});
	let order: string[] = [];
	let announcement = $state('');

	function scheduleSubmit(id: string, ms: number) {
		return setTimeout(() => {
			const entry = pending[id];
			delete pending[id];
			order = order.filter((x) => x !== id);
			if (entry && !entry.form.isConnected) return;
			entry?.form.requestSubmit();
		}, ms);
	}

	function setAnnouncement(msg: string) {
		// Force screen-reader re-announcement even when message is identical
		// by clearing synchronously and setting in a microtask.
		announcement = '';
		queueMicrotask(() => {
			announcement = msg;
		});
	}

	function queue(id: string, form: HTMLFormElement, title: string) {
		const existing = pending[id];
		if (existing) clearTimeout(existing.timer);
		const timer = scheduleSubmit(id, DISMISS_DELAY_MS);
		pending[id] = {
			timer,
			form,
			startedAt: performance.now(),
			remainingMs: DISMISS_DELAY_MS,
			paused: false
		};
		order = [...order.filter((x) => x !== id), id];
		setAnnouncement(t(getLocale(), 'common.reminder.dismissedAnnounce', { title }));
	}

	function undo(id: string, title: string) {
		const entry = pending[id];
		if (!entry) return;
		clearTimeout(entry.timer);
		delete pending[id];
		order = order.filter((x) => x !== id);
		setAnnouncement(t(getLocale(), 'common.reminder.restoredAnnounce', { title }));
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

	function pause(id: string) {
		const entry = pending[id];
		if (!entry || entry.paused) return;
		clearTimeout(entry.timer);
		const elapsed = performance.now() - entry.startedAt;
		entry.remainingMs = Math.max(0, entry.remainingMs - elapsed);
		entry.paused = true;
	}

	function resume(id: string) {
		const entry = pending[id];
		if (!entry) return;
		entry.paused = false;
		entry.startedAt = performance.now();
		entry.timer = scheduleSubmit(id, entry.remainingMs);
	}

	function cleanup() {
		for (const id of Object.keys(pending)) {
			clearTimeout(pending[id].timer);
		}
		pending = {};
		order = [];
		announcement = '';
	}

	return {
		get announcement() {
			return announcement;
		},
		isPending,
		queue,
		undo,
		undoLast,
		pause,
		resume,
		cleanup
	};
}
