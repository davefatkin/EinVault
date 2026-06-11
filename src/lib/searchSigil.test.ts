import { describe, it, expect } from 'vitest';
import { parseSigilToken, stripSigilToken } from './searchSigil';

describe('parseSigilToken', () => {
	it('detects a trailing @ token at start', () => {
		expect(parseSigilToken('@bis')).toEqual({ sigil: '@', partial: 'bis', start: 0 });
	});
	it('detects a trailing # token after whitespace', () => {
		expect(parseSigilToken('limp @bisc #hea')).toEqual({ sigil: '#', partial: 'hea', start: 11 });
	});
	it('treats an empty partial as show-all', () => {
		expect(parseSigilToken('walk @')).toEqual({ sigil: '@', partial: '', start: 5 });
	});
	it('does NOT trigger on email-like a@b', () => {
		expect(parseSigilToken('mail a@b')).toBeNull();
	});
	it('returns null when the trailing token is plain text', () => {
		expect(parseSigilToken('@bisc walk')).toBeNull();
	});
	it('returns null for empty input', () => {
		expect(parseSigilToken('')).toBeNull();
	});
});

describe('stripSigilToken', () => {
	it('removes the trailing token, keeping prior text', () => {
		const v = 'limp #hea';
		const tok = parseSigilToken(v)!;
		expect(stripSigilToken(v, tok)).toBe('limp ');
	});
	it('clears a sole token', () => {
		const v = '@bis';
		expect(stripSigilToken(v, parseSigilToken(v)!)).toBe('');
	});
});
