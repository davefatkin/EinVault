// Ctrl/Cmd keyboard shortcuts shared across the app. Alt is excluded so
// AltGr combinations (Ctrl+Alt on Windows) still type their character.

export function isModShortcut(e: KeyboardEvent, key: string): boolean {
	return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === key;
}

/** Write/Preview toggle in markdown editors. */
export function isPreviewToggle(e: KeyboardEvent): boolean {
	return isModShortcut(e, 'p');
}

/** Shortcut label for the current platform. Call after mount; SSR has no navigator. */
export function modKeyLabel(platform: string, key: string): string {
	return /mac|iphone|ipad|ipod/i.test(platform) ? `⌘${key}` : `Ctrl+${key}`;
}
