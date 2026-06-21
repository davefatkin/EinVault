import { browser } from '$app/environment';
import { Sun, Moon, Monitor } from '@lucide/svelte';

export type Theme = 'light' | 'dark' | 'system';

export const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
export const THEMES: readonly Theme[] = ['light', 'dark', 'system'];

export function applyTheme(t: string): void {
	if (!browser) return;
	const html = document.documentElement;
	if (t === 'dark') {
		html.classList.add('dark');
	} else if (t === 'light') {
		html.classList.remove('dark');
	} else {
		window.matchMedia('(prefers-color-scheme: dark)').matches
			? html.classList.add('dark')
			: html.classList.remove('dark');
	}
}

export const THEME_COOKIE = 'einvault_theme';

/** Reads the persisted theme cookie (used in demo mode, where the seed account's
 *  stored theme is frozen and the per-visitor choice lives in this cookie). */
export function readThemeCookie(): Theme | null {
	if (!browser) return null;
	const m = document.cookie.match(/(?:^|;\s*)einvault_theme=(light|dark|system)/);
	return (m?.[1] as Theme) ?? null;
}

/** Writes the theme cookie (1y, SameSite=Strict) — mirrors the server's attributes. */
export function writeThemeCookie(t: Theme): void {
	if (!browser) return;
	document.cookie = `${THEME_COOKIE}=${t};path=/;max-age=31536000;SameSite=Strict`;
}

export async function saveTheme(t: Theme, settingsPath = '/settings'): Promise<void> {
	const fd = new FormData();
	fd.set('theme', t);
	const res = await fetch(`${settingsPath}?/theme`, { method: 'POST', body: fd });
	if (!res.ok) console.error(`[einvault] Failed to save theme: ${res.status}`);
}
