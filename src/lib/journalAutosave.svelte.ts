import { beforeNavigate, goto } from '$app/navigation';
import { postFormAction } from '$lib/postFormAction';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'signedOut';

/**
 * Debounced autosave for the journal day editor. Call during component setup:
 * it registers beforeNavigate. A save posts to the day the text was typed on,
 * captured when it is scheduled, so it can never land on another day.
 *
 * Leaving with unsaved text:
 * - in-app navigation waits for the pending save, then continues;
 * - if that save fails, `leaveTarget` holds the destination so the page can
 *   ask, then call confirmLeave() or stay();
 * - a page unload sends a pending save with keepalive, and is cancelled (the
 *   browser's own prompt) only when a save already failed.
 */
export function createJournalAutosave(opts: {
	/** The day's save action, e.g. `/c1/journal/2026-01-02?/save`. */
	action: () => string;
	fields: () => { body: string; mood: string };
	delayMs?: number;
}) {
	const delayMs = opts.delayMs ?? 800;
	let status = $state<SaveStatus>('idle');
	let leaveTarget = $state<URL | null>(null);
	let timer: ReturnType<typeof setTimeout> | undefined;
	let savedTimer: ReturnType<typeof setTimeout> | undefined;
	let pendingAction: string | null = null;
	let inflight: Promise<void> | null = null;
	let bypass = false;

	function formData() {
		const { body, mood } = opts.fields();
		const fd = new FormData();
		fd.set('body', body);
		fd.set('mood', mood);
		return fd;
	}

	async function saveNow() {
		clearTimeout(timer);
		const action = pendingAction ?? opts.action();
		pendingAction = null;
		const run = (async () => {
			status = 'saving';
			clearTimeout(savedTimer);
			const outcome = await postFormAction(action, formData());
			status = outcome === 'failed' ? 'error' : outcome;
			// Keep a stale "Saved" fade-out from hiding a later failure.
			if (outcome === 'saved') savedTimer = setTimeout(() => (status = 'idle'), 2000);
		})();
		inflight = run;
		try {
			await run;
		} finally {
			if (inflight === run) inflight = null;
		}
	}

	function schedule() {
		clearTimeout(timer);
		clearTimeout(savedTimer);
		status = 'saving';
		pendingAction = opts.action();
		timer = setTimeout(saveNow, delayMs);
	}

	/** Write pending text before an action refreshes the page data. */
	async function flush() {
		if (inflight) await inflight;
		if (pendingAction !== null) await saveNow();
	}

	const failed = () => status === 'error' || status === 'signedOut';

	async function leave(to: URL) {
		leaveTarget = null;
		bypass = true;
		try {
			await goto(to);
		} finally {
			bypass = false;
		}
	}

	beforeNavigate((nav) => {
		if (bypass) return;
		if (pendingAction === null && inflight === null && !failed()) return;
		if (nav.willUnload) {
			if (pendingAction !== null) {
				clearTimeout(timer);
				// The page is going away; send it without holding the unload.
				fetch(pendingAction, {
					method: 'POST',
					body: formData(),
					keepalive: true,
					headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
				}).catch(() => {});
				pendingAction = null;
			} else if (failed()) {
				nav.cancel();
			}
			return;
		}
		nav.cancel();
		const to = nav.to?.url;
		if (!to) return;
		void (async () => {
			await flush();
			// One more try for a draft whose earlier save failed.
			if (status === 'error') await saveNow();
			if (failed()) leaveTarget = to;
			else await leave(to);
		})();
	});

	return {
		get status() {
			return status;
		},
		get leaveTarget() {
			return leaveTarget;
		},
		schedule,
		saveNow,
		flush,
		/** The sign-in link opens a new tab; save again when the user is back. */
		retryAfterSignIn() {
			if (status === 'signedOut') void saveNow();
		},
		/** The editor now shows another day or companion. */
		reset() {
			clearTimeout(timer);
			pendingAction = null;
			status = 'idle';
		},
		confirmLeave() {
			if (leaveTarget) void leave(leaveTarget);
		},
		stay() {
			leaveTarget = null;
		}
	};
}
