/** Digits after the decimal point for a currency (2 for USD, 0 for JPY). */
export function currencyDigits(currency: string): number {
	return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
		.maximumFractionDigits as number;
}

/** True when the runtime knows the ISO 4217 code. */
export function isValidCurrency(code: string): boolean {
	return (Intl.supportedValuesOf('currency') as string[]).includes(code);
}

/** Formats an amount in minor units (cents) for display. */
export function formatMoney(minor: number, currency: string, locale: string): string {
	const digits = currencyDigits(currency);
	return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
		minor / 10 ** digits
	);
}

/**
 * Parses user input into minor units. Accepts `.` or `,` as the decimal
 * separator. Empty input is null; negatives, junk and extra digits are 'invalid'.
 */
export function parseMoney(raw: string, currency: string): number | null | 'invalid' {
	const text = raw.trim();
	if (!text) return null;
	const match = /^(\d+)(?:[.,](\d*))?$/.exec(text);
	if (!match) return 'invalid';
	const digits = currencyDigits(currency);
	const frac = match[2] ?? '';
	if (frac.length > digits) return 'invalid';
	const minor = Number(match[1] + frac.padEnd(digits, '0'));
	return Number.isSafeInteger(minor) ? minor : 'invalid';
}

/** The currencies the admin setting offers; any other code the runtime knows is still accepted. */
export const COMMON_CURRENCIES = [
	'USD',
	'EUR',
	'GBP',
	'CAD',
	'AUD',
	'CHF',
	'JPY',
	'NZD',
	'SEK',
	'NOK',
	'DKK',
	'BRL',
	'MXN'
] as const;
