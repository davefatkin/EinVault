/**
 * Module-scoped toast store. The `ToastRegion` component reads `toasts` via
 * Svelte 5 `$state` reactivity; everything else uses the imperative helpers
 * below.
 *
 * Auto-dismiss uses real timers so it can be paused on hover/focus. Each toast
 * also records the original `durationMs` so a paused/resumed countdown bar can
 * be restarted with the correct CSS animation duration.
 *
 * Live-region announcements are handled by `role="status"` on each Toast
 * element, not by a separate aria-live container, so identical consecutive
 * messages still announce (each one is a fresh element).
 */

export type Toast = {
	id: string;
	title: string;
	description?: string;
	durationMs: number;
	onUndo?: () => void;
	onExpire?: () => void;
	onCommit?: () => void;
	onLogEvent?: () => void;
	undoLabel?: string;
	commitLabel?: string;
	logEventLabel?: string;
	dismissLabel?: string;
	progress: boolean;
	createdAt: number;
};

type ToastTimerState = {
	timer: ReturnType<typeof setTimeout>;
	startedAt: number;
	remainingMs: number;
	paused: boolean;
};

export const toasts = $state<Toast[]>([]);

// SvelteMap not needed: this Map only holds timer state, never participates in
// reactivity. Consumers read `toasts` (the reactive `$state`) for rendering.
// eslint-disable-next-line svelte/prefer-svelte-reactivity
const timers = new Map<string, ToastTimerState>();
let counter = 0;

function nextId(): string {
	counter++;
	return `t${Date.now().toString(36)}${counter.toString(36)}`;
}

function scheduleDismiss(id: string, ms: number) {
	return setTimeout(() => {
		const toast = toasts.find((t) => t.id === id);
		const onExpire = toast?.onExpire;
		removeToast(id);
		onExpire?.();
	}, ms);
}

export function addToast(opts: {
	id?: string;
	title: string;
	description?: string;
	durationMs: number;
	onUndo?: () => void;
	onExpire?: () => void;
	onCommit?: () => void;
	onLogEvent?: () => void;
	undoLabel?: string;
	commitLabel?: string;
	logEventLabel?: string;
	dismissLabel?: string;
	progress?: boolean;
}): string {
	const id = opts.id ?? nextId();
	const existingIdx = toasts.findIndex((t) => t.id === id);
	if (existingIdx !== -1) {
		const prev = timers.get(id);
		if (prev) clearTimeout(prev.timer);
		timers.delete(id);
		toasts.splice(existingIdx, 1);
	}

	const toast: Toast = {
		id,
		title: opts.title,
		description: opts.description,
		durationMs: opts.durationMs,
		onUndo: opts.onUndo,
		onExpire: opts.onExpire,
		onCommit: opts.onCommit,
		onLogEvent: opts.onLogEvent,
		undoLabel: opts.undoLabel,
		commitLabel: opts.commitLabel,
		logEventLabel: opts.logEventLabel,
		dismissLabel: opts.dismissLabel,
		progress: opts.progress ?? !!opts.onUndo,
		createdAt: performance.now()
	};
	toasts.push(toast);

	if (opts.durationMs > 0) {
		const timer = scheduleDismiss(id, opts.durationMs);
		timers.set(id, {
			timer,
			startedAt: performance.now(),
			remainingMs: opts.durationMs,
			paused: false
		});
	}

	return id;
}

export function removeToast(id: string) {
	const timer = timers.get(id);
	if (timer) {
		clearTimeout(timer.timer);
		timers.delete(id);
	}
	const idx = toasts.findIndex((t) => t.id === id);
	if (idx !== -1) toasts.splice(idx, 1);
}

export function pauseToast(id: string) {
	const entry = timers.get(id);
	if (!entry || entry.paused) return;
	clearTimeout(entry.timer);
	const elapsed = performance.now() - entry.startedAt;
	entry.remainingMs = Math.max(0, entry.remainingMs - elapsed);
	entry.paused = true;
}

export function resumeToast(id: string) {
	const entry = timers.get(id);
	if (!entry || !entry.paused) return;
	entry.paused = false;
	entry.startedAt = performance.now();
	entry.timer = scheduleDismiss(id, entry.remainingMs);
}

/** Invoke the toast's onUndo callback and remove it. No-op if missing. */
export function undoToast(id: string) {
	const toast = toasts.find((t) => t.id === id);
	if (!toast) return;
	const cb = toast.onUndo;
	removeToast(id);
	cb?.();
}
