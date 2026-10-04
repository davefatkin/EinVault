import { beforeNavigate, goto } from '$app/navigation';

/**
 * Unsaved-changes guard for an editor. Call during component setup (it
 * registers beforeNavigate). While dirty:
 * - in-app navigation is cancelled and `pending` holds the target, so the
 *   caller can show a ConfirmDialog and then call confirmLeave() or cancelLeave();
 * - navigation that unloads the page (tab close, reload, external link) is
 *   cancelled, which makes the browser show its own leave prompt.
 */
export function createDirtyGuard() {
	let dirty = $state(false);
	let pending = $state<URL | null>(null);
	let bypass = false;

	beforeNavigate((nav) => {
		if (!dirty || bypass) return;
		nav.cancel();
		if (nav.willUnload || !nav.to) return;
		pending = nav.to.url;
	});

	return {
		get dirty() {
			return dirty;
		},
		get pending() {
			return pending;
		},
		markDirty() {
			dirty = true;
		},
		markClean() {
			dirty = false;
		},
		async confirmLeave() {
			const to = pending;
			pending = null;
			if (!to) return;
			dirty = false;
			bypass = true;
			try {
				await goto(to);
			} finally {
				bypass = false;
			}
		},
		cancelLeave() {
			pending = null;
		}
	};
}
