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

export async function saveTheme(t: Theme, settingsPath = '/settings'): Promise<void> {
	const fd = new FormData();
	fd.set('theme', t);
	const res = await fetch(`${settingsPath}?/theme`, { method: 'POST', body: fd });
	if (!res.ok) console.error(`[einvault] Failed to save theme: ${res.status}`);
}
