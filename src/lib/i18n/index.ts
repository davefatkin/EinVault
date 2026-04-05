import { getContext } from 'svelte';
import en from './en';
import it from './it';
import de from './de';
import es from './es';
import fr from './fr';
import pt from './pt';
import type { MessageKey } from './en';

export type { MessageKey };
export type Locale = 'en' | 'it' | 'de' | 'es' | 'fr' | 'pt';

export const SUPPORTED_LOCALES: Locale[] = ['de', 'en', 'es', 'fr', 'it', 'pt'];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_LABELS: Record<Locale, string> = {
	en: 'English',
	it: 'Italiano',
	de: 'Deutsch',
	es: 'Español',
	fr: 'Français',
	pt: 'Português'
};

const catalogs: Record<Locale, Record<string, string>> = {
	en,
	it,
	de,
	es,
	fr,
	pt
};

/** Resolve a raw string to a supported locale. */
export function resolveLocale(raw: string | null | undefined): Locale {
	if (!raw) return DEFAULT_LOCALE;
	const lower = raw.toLowerCase();
	// Exact match
	if (SUPPORTED_LOCALES.includes(lower as Locale)) return lower as Locale;
	// Language prefix match (e.g. "it-IT" → "it")
	const prefix = lower.split('-')[0];
	if (SUPPORTED_LOCALES.includes(prefix as Locale)) return prefix as Locale;
	return DEFAULT_LOCALE;
}

/** Parse the Accept-Language header and return the best supported locale. */
export function parseAcceptLanguage(header: string | null): Locale {
	if (!header) return DEFAULT_LOCALE;
	const entries = header
		.split(',')
		.map((part) => {
			const [lang, q] = part.trim().split(';q=');
			return { lang: lang.trim(), q: q ? parseFloat(q) : 1 };
		})
		.sort((a, b) => b.q - a.q);

	for (const { lang } of entries) {
		const resolved = resolveLocale(lang);
		if (resolved !== DEFAULT_LOCALE || lang.toLowerCase().startsWith('en')) return resolved;
	}
	return DEFAULT_LOCALE;
}

/** Translate a message key, with optional {param} interpolation. */
export function t(
	locale: Locale,
	key: MessageKey,
	params?: Record<string, string | number>
): string {
	const catalog = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
	let msg = catalog[key] ?? catalogs[DEFAULT_LOCALE][key] ?? key;
	if (params) {
		for (const [k, v] of Object.entries(params)) {
			msg = msg.replaceAll(`{${k}}`, String(v));
		}
	}
	return msg;
}

/** Get the current locale from Svelte context. Use in components only. */
export function getLocale(): Locale {
	return getContext<Locale>('locale') ?? DEFAULT_LOCALE;
}
