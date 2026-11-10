import { describe, it, expect } from 'vitest';
import en from '#lib/i18n/en.js';
import {
	OWNER_SECTIONS,
	CARETAKER_SECTIONS,
	PAGE_SECTIONS,
	sectionHref,
	isSectionActive,
	switchTarget
} from '#lib/nav/sections.js';

describe('sectionHref', () => {
	it('builds owner and caretaker hrefs', () => {
		expect(sectionHref('owner', 'c1', '')).toBe('/c1');
		expect(sectionHref('owner', 'c1', 'notes')).toBe('/c1/notes');
		expect(sectionHref('caretaker', 'c1', 'log')).toBe('/care/c1/log');
		expect(sectionHref('caretaker', 'c1', '')).toBe('/care/c1');
	});
	it('keeps audiences apart', () => {
		for (const s of CARETAKER_SECTIONS)
			expect(sectionHref('caretaker', 'c1', s.path).startsWith('/care/')).toBe(true);
		for (const s of OWNER_SECTIONS)
			expect(sectionHref('owner', 'c1', s.path).startsWith('/care/')).toBe(false);
	});
});

describe('isSectionActive', () => {
	it('matches the dashboard only at the root', () => {
		expect(isSectionActive('owner', '', '/c1', 'c1')).toBe(true);
		expect(isSectionActive('owner', '', '/c1/journal', 'c1')).toBe(false);
	});
	it('matches nested paths', () => {
		expect(isSectionActive('owner', 'journal', '/c1/journal', 'c1')).toBe(true);
		expect(isSectionActive('owner', 'journal', '/c1/journal/2026-05-12', 'c1')).toBe(true);
		expect(isSectionActive('owner', 'health', '/c1/health/incidents/x', 'c1')).toBe(true);
		expect(isSectionActive('owner', 'health', '/c1/healthy', 'c1')).toBe(false);
	});
	it('handles caretaker overview', () => {
		expect(isSectionActive('caretaker', '', '/care/c1', 'c1')).toBe(true);
		expect(isSectionActive('caretaker', '', '/care/c1/log', 'c1')).toBe(false);
		expect(isSectionActive('caretaker', 'log', '/care/c1/log', 'c1')).toBe(true);
	});
});

describe('switchTarget', () => {
	const cases: [string, string][] = [
		['/c1', '/c2'],
		['/c1/medications/m9', '/c2/medications'],
		['/c1/supplies/s1/edit', '/c2/supplies'],
		['/c1/notes/new', '/c2/notes'],
		['/c1/health/incidents/i1', '/c2/health'],
		['/c1/journal/2026-05-12', '/c2/journal/2026-05-12'],
		['/c1/journal', '/c2/journal'],
		['/c1/log', '/c2/log'],
		['/c1/sheet', '/c2/sheet'],
		['/care/c1/sheet', '/care/c2/sheet'],
		['/care/c1/incidents/i1', '/care/c2'],
		['/care/c1/incidents/new', '/care/c2'],
		['/care/c1/journal', '/care/c2/journal'],
		['/settings', '/c2'],
		['/', '/c2']
	];
	it.each(cases)('%s -> %s', (from, to) => {
		expect(switchTarget(from, 'c2')).toBe(to);
	});
});

describe('config', () => {
	it('covers every routed section folder', () => {
		const folders = (glob: Record<string, unknown>, re: RegExp) =>
			Object.keys(glob)
				.map((p) => re.exec(p)?.[1])
				.filter((x): x is string => !!x);
		const owner = folders(
			import.meta.glob('/src/routes/\\(app\\)/\\(companion\\)/\\[companionId\\]/*/+page.svelte'),
			/\[companionId\]\/([^/]+)\/\+page\.svelte$/
		);
		const care = folders(
			import.meta.glob('/src/routes/\\(caretaker\\)/care/\\[companionId\\]/*/+page.svelte'),
			/\[companionId\]\/([^/]+)\/\+page\.svelte$/
		);
		expect(owner.length).toBeGreaterThan(5);
		expect(care.length).toBeGreaterThan(1);
		const ownerKnown = [...OWNER_SECTIONS.map((s) => s.path), ...PAGE_SECTIONS.owner];
		const careKnown = [...CARETAKER_SECTIONS.map((s) => s.path), ...PAGE_SECTIONS.caretaker];
		for (const f of owner) expect(ownerKnown).toContain(f);
		for (const f of care) expect(careKnown).toContain(f);
		expect(careKnown).not.toContain('incidents');
		expect(ownerKnown.filter((p) => p && !owner.includes(p))).toEqual([]);
		expect(careKnown.filter((p) => p && !care.includes(p))).toEqual([]);
	});
	it('has unique keys per audience', () => {
		for (const list of [OWNER_SECTIONS, CARETAKER_SECTIONS]) {
			const keys = list.map((s) => s.key);
			expect(new Set(keys).size).toBe(keys.length);
		}
	});
	it('only references keys that exist in en', () => {
		const keys = [
			...OWNER_SECTIONS.flatMap((s) => [s.labelKey, s.tabLabelKey]),
			...CARETAKER_SECTIONS.map((s) => s.labelKey)
		].filter((k): k is NonNullable<typeof k> => !!k);
		for (const k of keys) expect(en).toHaveProperty(k);
	});
});
