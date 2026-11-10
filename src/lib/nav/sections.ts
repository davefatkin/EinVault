import type { MessageKey } from '#lib/i18n/en.js';

/**
 * Display-only navigation config shared by the top bar, bottom bar and More
 * sheet. It decides what to show, never who may see it: the route guard and
 * the layouts keep enforcing roles.
 */

export type NavGroup = 'primary' | 'health' | 'records';
type Base = { key: string; path: string; labelKey: MessageKey };
export type OwnerSection = Base & {
	audience: 'owner';
	group: NavGroup;
	mobile: 'tab' | 'more';
	tabLabelKey?: MessageKey;
};
export type CaretakerSection = Base & { audience: 'caretaker'; restricted: boolean };

export const OWNER_SECTIONS: readonly OwnerSection[] = [
	{
		key: 'dashboard',
		path: '',
		labelKey: 'nav.dashboard',
		tabLabelKey: 'nav.home',
		audience: 'owner',
		group: 'primary',
		mobile: 'tab'
	},
	{
		key: 'journal',
		path: 'journal',
		labelKey: 'nav.journal',
		audience: 'owner',
		group: 'primary',
		mobile: 'tab'
	},
	{
		key: 'reminders',
		path: 'reminders',
		labelKey: 'nav.reminders',
		audience: 'owner',
		group: 'primary',
		mobile: 'tab'
	},
	{
		key: 'health',
		path: 'health',
		labelKey: 'nav.health',
		audience: 'owner',
		group: 'health',
		mobile: 'more'
	},
	{
		key: 'medications',
		path: 'medications',
		labelKey: 'nav.medications',
		audience: 'owner',
		group: 'health',
		mobile: 'more'
	},
	{
		key: 'supplies',
		path: 'supplies',
		labelKey: 'nav.supplies',
		audience: 'owner',
		group: 'health',
		mobile: 'more'
	},
	{
		key: 'documents',
		path: 'documents',
		labelKey: 'nav.documents',
		audience: 'owner',
		group: 'records',
		mobile: 'more'
	},
	{
		key: 'notes',
		path: 'notes',
		labelKey: 'nav.notes',
		audience: 'owner',
		group: 'records',
		mobile: 'more'
	}
];

export const CARETAKER_SECTIONS: readonly CaretakerSection[] = [
	{
		key: 'overview',
		path: '',
		labelKey: 'nav.caretaker.overview',
		audience: 'caretaker',
		restricted: false
	},
	{
		key: 'journal',
		path: 'journal',
		labelKey: 'nav.journal',
		audience: 'caretaker',
		restricted: true
	},
	{
		key: 'log',
		path: 'log',
		labelKey: 'nav.caretaker.logActivity',
		audience: 'caretaker',
		restricted: true
	}
];

/** Routed section folders that are reachable but not listed in the nav. */
export const PAGE_SECTIONS: { owner: readonly string[]; caretaker: readonly string[] } = {
	owner: ['log', 'sheet'],
	caretaker: ['log', 'sheet']
};

export const NAV_GROUP_LABELS: Record<Exclude<NavGroup, 'primary'>, MessageKey> = {
	health: 'nav.group.care',
	records: 'nav.group.records'
};

type Audience = 'owner' | 'caretaker';

export function sectionHref(audience: Audience, companionId: string, path: string): string {
	const base = audience === 'caretaker' ? `/care/${companionId}` : `/${companionId}`;
	return path ? `${base}/${path}` : base;
}

export function parseNavPath(pathname: string): {
	audience: Audience;
	companionId: string | null;
	section: string;
	rest: string[];
} {
	const parts = pathname.split('/').filter(Boolean);
	if (parts[0] === 'care') {
		return {
			audience: 'caretaker',
			companionId: parts[1] ?? null,
			section: parts[2] ?? '',
			rest: parts.slice(3)
		};
	}
	return {
		audience: 'owner',
		companionId: parts[0] ?? null,
		section: parts[1] ?? '',
		rest: parts.slice(2)
	};
}

export function isSectionActive(
	audience: Audience,
	path: string,
	pathname: string,
	companionId: string
): boolean {
	const href = sectionHref(audience, companionId, path);
	if (path === '') return pathname === href || pathname === `${href}/`;
	return pathname === href || pathname.startsWith(`${href}/`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Where the companion switcher should land on `toId`, keeping the section. */
export function switchTarget(pathname: string, toId: string): string {
	const { audience, companionId, section, rest } = parseNavPath(pathname);
	if (!companionId) return sectionHref('owner', toId, '');
	const configured = (audience === 'owner' ? OWNER_SECTIONS : CARETAKER_SECTIONS).map(
		(s) => s.path
	);
	const known = [...configured, ...PAGE_SECTIONS[audience]];
	if (!section || !known.includes(section)) return sectionHref(audience, toId, '');
	if (audience === 'owner' && section === 'journal' && rest[0] && ISO_DATE.test(rest[0])) {
		return sectionHref(audience, toId, `journal/${rest[0]}`);
	}
	return sectionHref(audience, toId, section);
}
