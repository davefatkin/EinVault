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
 * Pattern: clicking dismiss delays the server submit by `delayMs`
 * and shows an in-row Undo button. Undo cancels the timer. No server
 * call ever happens.
 *
 * `getDelayMs()` returns the current undo window in milliseconds. A
 * value of 0 means no undo window. `queue()` submits immediately in that case.
 */
export function createPendingDismissals(
	getLocale: () => Locale,
	getDelayMs: () => number = () => DISMISS_DELAY_MS
) {
	let pending = $state<Record<string, PendingEntry>>({});
	let order: string[] = [];
	let announcement = $state('');

	function scheduleSubmit(id: string, ms: number) {
		return setTimeout(() => {
			// Re-read inside the timer: commit/undo may have already cleared
			// the entry, in which case we must NOT submit again (would double-POST).
			const entry = pending[id];
			if (!entry) return;
			delete pending[id];
			order = order.filter((x) => x !== id);
			if (!entry.form.isConnected) return;
			entry.form.requestSubmit();
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
		const delayMs = getDelayMs();
		if (delayMs <= 0) {
			setAnnouncement(t(getLocale(), 'common.reminder.dismissedAnnounce', { title }));
			form.requestSubmit();
			return;
		}
		const existing = pending[id];
		if (existing) clearTimeout(existing.timer);
		const timer = scheduleSubmit(id, delayMs);
		pending[id] = {
			timer,
			form,
			startedAt: performance.now(),
			remainingMs: delayMs,
			paused: false
		};
		order = [...order.filter((x) => x !== id), id];
		setAnnouncement(t(getLocale(), 'common.reminder.dismissedAnnounce', { title }));
	}

	function commit(id: string, title: string) {
		const entry = pending[id];
		if (!entry) return;
		clearTimeout(entry.timer);
		delete pending[id];
		order = order.filter((x) => x !== id);
		setAnnouncement(t(getLocale(), 'common.reminder.dismissedAnnounce', { title }));
		if (entry.form.isConnected) entry.form.requestSubmit();
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
	 * Falls back to a generic localized "Untitled reminder" string when the
	 * lookup returns undefined (e.g. the reminder list reactivity briefly drops
	 * the entry).
	 */
	function undoLast(titleForId: (id: string) => string | undefined): boolean {
		if (order.length === 0) return false;
		const id = order[order.length - 1];
		const title = titleForId(id) ?? t(getLocale(), 'common.reminder.untitled');
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
		/** Commit the pending dismissal immediately (skip remaining undo window). */
		commit,
		pause,
		resume,
		cleanup
	};
}
