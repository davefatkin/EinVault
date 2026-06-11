import { describe, it, expect } from 'vitest';
import { icsDate, icsEscape, foldLine, icsLocal, icsDateOnly, vtimezoneBlock } from './ics';

describe('icsDate', () => {
	it('formats a Date as UTC basic format', () => {
		expect(icsDate(new Date('2026-06-09T14:30:05.123Z'))).toBe('20260609T143005Z');
	});
});

describe('icsEscape', () => {
	it('passes plain text through', () => {
		expect(icsEscape('walk Biscuit')).toBe('walk Biscuit');
	});
	it('normalizes CR and escapes specials', () => {
		expect(icsEscape('a,b;c\\d\r\ne')).toBe('a\\,b\\;c\\\\d\\ne');
	});
});

describe('foldLine', () => {
	it('leaves short lines untouched', () => {
		expect(foldLine('SUMMARY:hi')).toBe('SUMMARY:hi');
	});
	it('folds at 75 octets with a leading space on continuations', () => {
		const long = 'SUMMARY:' + 'x'.repeat(100);
		const folded = foldLine(long);
		const lines = folded.split('\r\n');
		expect(lines.length).toBeGreaterThan(1);
		expect(Buffer.byteLength(lines[0], 'utf8')).toBeLessThanOrEqual(75);
		expect(lines[1].startsWith(' ')).toBe(true);
	});
	it('never splits a multi-byte sequence', () => {
		const long = 'X:' + '😀'.repeat(40);
		for (const l of foldLine(long).split('\r\n ')) {
			expect(() =>
				new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(l))
			).not.toThrow();
		}
	});
});

describe('icsLocal / icsDateOnly', () => {
	it('renders wall-clock in the given zone', () => {
		const d = new Date('2026-06-15T13:00:00Z'); // 09:00 in America/New_York (EDT)
		expect(icsLocal(d, 'America/New_York')).toBe('20260615T090000');
		expect(icsDateOnly(d, 'America/New_York')).toBe('20260615');
	});
});

describe('vtimezoneBlock', () => {
	it('returns a VTIMEZONE for a known zone', () => {
		expect(vtimezoneBlock('America/New_York')).toContain('BEGIN:VTIMEZONE');
	});
	it('returns null for an unknown zone', () => {
		expect(vtimezoneBlock('Not/AZone')).toBeNull();
	});
});
