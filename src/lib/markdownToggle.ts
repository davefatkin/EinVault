// Write/Preview toggle shortcut shared by MarkdownTextarea and the journal
// day editor. Alt is excluded so AltGr+P (Ctrl+Alt on Windows) still types.

export function isPreviewToggle(e: KeyboardEvent): boolean {
	return (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'p';
}

/** Shortcut label for the current platform. Call after mount; SSR has no navigator. */
export function previewToggleLabel(platform: string): string {
	return /mac|iphone|ipad|ipod/i.test(platform) ? '⌘P' : 'Ctrl+P';
}
