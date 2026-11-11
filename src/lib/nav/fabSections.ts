import { parseNavPath } from '#lib/nav/sections.js';

/** A quick-add action shown in the FAB menu. `key` ties it to a section. */
export interface FabAction {
	key: string;
	href: string;
	label: string;
}

export type FabActionOrdered = FabAction & { highlight: boolean };

/**
 * Map a pathname to the FAB "section" it belongs to, or null when the section
 * has no matching quick-add action (e.g. the companion dashboard root, or any
 * non-companion page). Works for both owner (`/{id}/...`) and caretaker
 * (`/care/{id}/...`) routes.
 */
export function currentFabSection(pathname: string): string | null {
	const { audience, companionId, section } = parseNavPath(pathname);
	if (!companionId) return null;
	const allowed =
		audience === 'caretaker' ? ['log', 'journal'] : ['journal', 'health', 'reminders'];
	return allowed.includes(section) ? section : null;
}

/**
 * Which action keys a section should surface/highlight. A section may map to
 * more than one action (health → log event + record weight).
 */
const SECTION_TO_ACTION_KEYS: Record<string, string[]> = {
	journal: ['journal'],
	health: ['health', 'weight'],
	reminders: ['reminders'],
	log: ['log']
};

/**
 * Return the actions reordered so the current section's action(s) come first
 * and are flagged `highlight: true`. Stable for the rest. Pure — never mutates
 * the input.
 */
export function orderFabActions(actions: FabAction[], section: string | null): FabActionOrdered[] {
	const matchKeys = section ? (SECTION_TO_ACTION_KEYS[section] ?? []) : [];
	const isMatch = (a: FabAction) => matchKeys.includes(a.key);
	const matched = actions.filter(isMatch).map((a) => ({ ...a, highlight: true }));
	const rest = actions.filter((a) => !isMatch(a)).map((a) => ({ ...a, highlight: false }));
	return [...matched, ...rest];
}
