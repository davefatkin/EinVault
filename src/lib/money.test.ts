import { describe, it, expect } from 'vitest';
import { currencyDigits, formatMoney, parseMoney, isValidCurrency } from './money';

describe('money', () => {
	it('knows currency digits', () => {
		expect(currencyDigits('USD')).toBe(2);
		expect(currencyDigits('JPY')).toBe(0);
	});
	it('parses input into minor units', () => {
		expect(parseMoney('12.34', 'USD')).toBe(1234);
		expect(parseMoney('12,5', 'EUR')).toBe(1250);
		expect(parseMoney('12', 'USD')).toBe(1200);
		expect(parseMoney('1500', 'JPY')).toBe(1500);
		expect(parseMoney('', 'USD')).toBeNull();
		expect(parseMoney('  ', 'USD')).toBeNull();
	});
	it('rejects bad input', () => {
		expect(parseMoney('1.5', 'JPY')).toBe('invalid');
		expect(parseMoney('-1', 'USD')).toBe('invalid');
		expect(parseMoney('1.234', 'USD')).toBe('invalid');
		expect(parseMoney('abc', 'USD')).toBe('invalid');
		expect(parseMoney('1.2.3', 'USD')).toBe('invalid');
	});
	it('formats minor units', () => {
		expect(formatMoney(1234, 'USD', 'en')).toBe('$12.34');
		expect(formatMoney(1500, 'JPY', 'en')).toBe('¥1,500');
	});
	it('validates codes', () => {
		expect(isValidCurrency('USD')).toBe(true);
		expect(isValidCurrency('XYZ')).toBe(false);
	});
});
