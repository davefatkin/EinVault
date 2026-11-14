import { applyAction, type SubmitFunction } from '$app/forms';
import { goto, refreshAll } from '$app/navigation';
import { page } from '$app/state';
import { t, type Locale } from '#lib/i18n/index.js';
import {
	applyAttachments,
	emptyPending,
	type AttachFailure,
	type PendingAttachments
} from '#lib/healthAttachments.js';

export type SavedHealthEvent = {
	healthEventId: string;
	day: string;
	reminderUrl: string | null;
};

/** The ?/addHealth result. */
function readAdded(data: Record<string, unknown>): SavedHealthEvent {
	return {
		healthEventId: String(data.healthEventId),
		day: String(data.day),
		reminderUrl: typeof data.reminderUrl === 'string' ? data.reminderUrl : null
	};
}

/**
 * Save flow for a health event form with attachments. `submit` goes to
 * `use:enhance`; once the action saves the event, `pending` is applied to it.
 * The event stays saved if any attachment fails: `phase` turns 'failed' and
 * `failures` names each one. A failed save keeps the form and its picks (no
 * `update()`, which would reset the form).
 *
 * Getters are read when a save starts, so pass `() => locale` captured at
 * component setup, never `getLocale` itself.
 *
 * If the URL changed while saving (Back, or another pet), the save keeps its
 * records but neither shows failures nor opens the reminder.
 */
export function createHealthEventSave(opts: {
	companionId: () => string;
	/** Titles of documents that pending.linkIds/unlinkIds may name, for failure lines. */
	titles: () => Record<string, string>;
	locale: () => Locale;
	/** Called after a clean save, before any reminder navigation, and on a redirect. */
	onclose: () => void;
	/** Runs before the form is sent; a throw cancels the save. */
	before?: () => Promise<void>;
	/** Reads the saved event from the action's data. Defaults to ?/addHealth's. */
	readSaved?: (data: Record<string, unknown>) => SavedHealthEvent;
}) {
	const readSaved = opts.readSaved ?? readAdded;
	let phase = $state<'form' | 'saving' | 'failed'>('form');
	let error = $state<string | null>(null);
	let pending = $state<PendingAttachments>(emptyPending());
	let failures = $state<AttachFailure[]>([]);
	let reminderUrl = $state<string | null>(null);

	function reset() {
		phase = 'form';
		error = null;
		pending = emptyPending();
		failures = [];
		reminderUrl = null;
	}

	const submit: SubmitFunction = async ({ cancel }) => {
		if (phase !== 'form') {
			cancel();
			return;
		}
		const locale = opts.locale();
		const actionFailed = t(locale, 'media.actionFailed');
		phase = 'saving';
		error = null;
		if (opts.before) {
			try {
				await opts.before();
			} catch {
				phase = 'form';
				error = actionFailed;
				cancel();
				return;
			}
		}
		const companionId = opts.companionId();
		const titles = opts.titles();
		const here = page.url.pathname;
		const changes = pending;
		return async ({ result }) => {
			if (result.type === 'redirect') {
				// Demo mode and the 2FA gate answer writes with a redirect: follow it.
				phase = 'form';
				opts.onclose();
				await applyAction(result);
				return;
			}
			if (result.type !== 'success' || !result.data) {
				phase = 'form';
				error =
					result.type === 'failure'
						? String(result.data?.healthError ?? actionFailed)
						: actionFailed;
				return;
			}
			// The event exists from here on: never return to the form.
			const saved = readSaved(result.data);
			let failed: AttachFailure[] = [];
			try {
				failed = await applyAttachments({
					companionId,
					healthEventId: saved.healthEventId,
					day: saved.day,
					pending: changes,
					titles,
					locale
				});
				await refreshAll();
			} catch {
				// Fall through: the event is saved, so close rather than stay locked.
			}
			// Left mid-save: drop this save's picks so a reused page starts clean.
			if (page.url.pathname !== here) {
				reset();
				return;
			}
			phase = 'form';
			if (failed.length > 0) {
				failures = failed;
				reminderUrl = saved.reminderUrl;
				phase = 'failed';
				return;
			}
			opts.onclose();
			if (saved.reminderUrl) await goto(saved.reminderUrl);
		};
	};

	return {
		get phase() {
			return phase;
		},
		get error() {
			return error;
		},
		get pending() {
			return pending;
		},
		set pending(value: PendingAttachments) {
			pending = value;
		},
		get failures() {
			return failures;
		},
		get reminderUrl() {
			return reminderUrl;
		},
		submit,
		/** Back to an empty form. */
		reset
	};
}
