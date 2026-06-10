import { describe, it, expect } from 'vitest';
import { icsDate, icsEscape } from './ics';

describe('icsDate', () => {
	it('formats a Date as UTC basic format', () => {
		expect(icsDate(new Date('2026-06-09T14:30:05.123Z'))).toBe('20260609T143005Z');
	});
});

describe('icsEscape', () => {
	it('escapes backslash, semicolon, comma, newline', () => {
		expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
	});

	it('passes plain text through', () => {
		expect(icsEscape('walk Biscuit')).toBe('walk Biscuit');
	});
});
