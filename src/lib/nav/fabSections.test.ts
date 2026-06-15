import { describe, it, expect } from 'vitest';
import { currentFabSection, orderFabActions, type FabAction } from './fabSections';

const ACTIONS: FabAction[] = [
	{ key: 'journal', href: '/c1/journal/2026-06-12', label: 'Add journal entry' },
	{ key: 'health', href: '/c1/health?new=1', label: 'Log health event' },
	{ key: 'reminders', href: '/c1/reminders?new=1', label: 'Add reminder' },
	{ key: 'weight', href: '/c1/health?new=weight', label: 'Record weight' }
];

describe('currentFabSection', () => {
	it('maps the dashboard (companion root) to null', () => {
		expect(currentFabSection('/c1')).toBeNull();
	});
	it('maps a journal path to journal', () => {
		expect(currentFabSection('/c1/journal')).toBe('journal');
		expect(currentFabSection('/c1/journal/2026-06-12')).toBe('journal');
	});
	it('maps health paths to health', () => {
		expect(currentFabSection('/c1/health')).toBe('health');
	});
	it('maps reminders paths to reminders', () => {
		expect(currentFabSection('/c1/reminders')).toBe('reminders');
	});
	it('maps caretaker log paths to log', () => {
		expect(currentFabSection('/care/c1/log')).toBe('log');
	});
	it('maps caretaker journal paths to journal', () => {
		expect(currentFabSection('/care/c1/journal')).toBe('journal');
	});
	it('returns null for unknown paths', () => {
		expect(currentFabSection('/settings')).toBeNull();
		expect(currentFabSection('/')).toBeNull();
	});
});

describe('orderFabActions', () => {
	it('returns default order with no highlight when section is null', () => {
		const out = orderFabActions(ACTIONS, null);
		expect(out.map((a) => a.key)).toEqual(['journal', 'health', 'reminders', 'weight']);
		expect(out.every((a) => a.highlight === false)).toBe(true);
	});
	it('floats the matching section action to the top and highlights it', () => {
		const out = orderFabActions(ACTIONS, 'reminders');
		expect(out[0].key).toBe('reminders');
		expect(out[0].highlight).toBe(true);
		expect(out.filter((a) => a.highlight).map((a) => a.key)).toEqual(['reminders']);
	});
	it('treats health as matching both health and weight actions', () => {
		const out = orderFabActions(ACTIONS, 'health');
		expect(
			out
				.slice(0, 2)
				.map((a) => a.key)
				.sort()
		).toEqual(['health', 'weight']);
		expect(
			out
				.filter((a) => a.highlight)
				.map((a) => a.key)
				.sort()
		).toEqual(['health', 'weight']);
	});
	it('preserves the relative order of non-matching actions', () => {
		const out = orderFabActions(ACTIONS, 'journal');
		expect(out.map((a) => a.key)).toEqual(['journal', 'health', 'reminders', 'weight']);
	});
	it('does not mutate the input array', () => {
		const copy = [...ACTIONS];
		orderFabActions(ACTIONS, 'reminders');
		expect(ACTIONS).toEqual(copy);
	});
});
