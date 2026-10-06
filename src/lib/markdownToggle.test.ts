import { describe, it, expect } from 'vitest';
import { isPreviewToggle, previewToggleLabel } from './markdownToggle';

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

describe('previewToggleLabel', () => {
	it('uses the command key on Apple platforms', () => {
		expect(previewToggleLabel('MacIntel')).toBe('⌘P');
		expect(previewToggleLabel('iPad')).toBe('⌘P');
	});
	it('uses Ctrl elsewhere', () => {
		expect(previewToggleLabel('Win32')).toBe('Ctrl+P');
		expect(previewToggleLabel('Linux x86_64')).toBe('Ctrl+P');
		expect(previewToggleLabel('')).toBe('Ctrl+P');
	});
});
