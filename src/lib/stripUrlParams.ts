import { goto } from '$app/navigation';
import { page } from '$app/state';

/**
 * Drops one-shot deep-link params (`?edit=`, `?new=1`, ...) from the current
 * URL so a reload doesn't reopen what they opened. Uses a shallow, replacing
 * `goto`: no load runs, the history entry is replaced, and `page.url` stays in
 * sync. Calling `history.replaceState` directly conflicts with Kit's router.
 */
export function stripUrlParams(...keys: string[]): void {
	const url = new URL(page.url.href);
	for (const key of keys) url.searchParams.delete(key);
	// Same page, rebuilt from page.url, so there is no route to resolve().
	// eslint-disable-next-line svelte/no-navigation-without-resolve
	void goto(url.pathname + url.search + url.hash, {
		replace: true,
		shallow: true,
		state: page.state
	});
}
