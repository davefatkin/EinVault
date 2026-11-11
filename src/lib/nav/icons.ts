import type { Component } from 'svelte';
import {
	House,
	NotebookPen,
	Bell,
	HeartPulse,
	Pill,
	Package,
	FileText,
	StickyNote,
	Home,
	ClipboardList,
	Settings,
	Ellipsis
} from '@lucide/svelte';

/** Icons by nav section key, shared by the bottom bar, More sheet and top bar. */
export const NAV_ICONS: Record<string, Component> = {
	dashboard: House,
	journal: NotebookPen,
	reminders: Bell,
	health: HeartPulse,
	medications: Pill,
	supplies: Package,
	documents: FileText,
	notes: StickyNote,
	overview: Home,
	log: ClipboardList,
	settings: Settings,
	more: Ellipsis
};
