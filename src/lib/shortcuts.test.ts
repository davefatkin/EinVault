import { describe, it, expect } from 'vitest';
import { isModShortcut, isPreviewToggle, modKeyLabel } from './shortcuts';

function key(init: Partial<KeyboardEvent>) {
	return {
		metaKey: false,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		...init
	} as KeyboardEvent;
}

describe('isPreviewToggle', () => {
	it('matches Ctrl+P and Cmd+P', () => {
		expect(isPreviewToggle(key({ ctrlKey: true, key: 'p' }))).toBe(true);
		expect(isPreviewToggle(key({ metaKey: true, key: 'p' }))).toBe(true);
		expect(isPreviewToggle(key({ ctrlKey: true, key: 'P' }))).toBe(true);
	});
	it('ignores plain P, Shift and AltGr combinations', () => {
		expect(isPreviewToggle(key({ key: 'p' }))).toBe(false);
		expect(isPreviewToggle(key({ ctrlKey: true, shiftKey: true, key: 'P' }))).toBe(false);
		expect(isPreviewToggle(key({ ctrlKey: true, altKey: true, key: 'p' }))).toBe(false);
	});
});

describe('isModShortcut', () => {
	it('matches the given key only', () => {
		expect(isModShortcut(key({ ctrlKey: true, key: 'k' }), 'k')).toBe(true);
		expect(isModShortcut(key({ ctrlKey: true, key: 'p' }), 'k')).toBe(false);
	});
});

describe('modKeyLabel', () => {
	it('uses the command key on Apple platforms', () => {
		expect(modKeyLabel('MacIntel', 'P')).toBe('⌘P');
		expect(modKeyLabel('iPad', 'P')).toBe('⌘P');
	});
	it('uses Ctrl elsewhere', () => {
		expect(modKeyLabel('Win32', 'P')).toBe('Ctrl+P');
		expect(modKeyLabel('Linux x86_64', 'P')).toBe('Ctrl+P');
		expect(modKeyLabel('', 'P')).toBe('Ctrl+P');
	});
});
