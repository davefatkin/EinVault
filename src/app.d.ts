import type { Locale } from '$lib/i18n';

declare global {
	namespace App {
		interface Locals {
			user: {
				id: string;
				username: string;
				displayName: string;
				role: 'admin' | 'member' | 'caretaker';
				isActive: boolean;
				theme: 'light' | 'dark' | 'system';
				locale: Locale;
				email: string | null;
				phone: string | null;
				reminderUndoSeconds: number | null;
			} | null;
			session: {
				id: string;
				userId: string;
				fresh: boolean;
				expiresAt: Date;
			} | null;
			locale: Locale;
		}
		interface PageData {
			user?: App.Locals['user'];
		}
	}
}
export {};
