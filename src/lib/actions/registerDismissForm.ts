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
