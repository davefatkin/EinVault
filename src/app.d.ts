import type { Locale } from '$lib/i18n';
import type { RecurrenceUnit } from '$lib/reminderRecurrence';

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
				defaultRecurrenceUnit: RecurrenceUnit | null;
				notifyReminderEmail: boolean;
				notifyShiftEmail: boolean;
				ntfyTopic: string | null;
				avatarPath: string | null;
				totpEnabled: boolean;
				isOidc: boolean;
				apiAccessEnabled: boolean;
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
		// Bearer-API error bodies carry a stable machine-parseable `code` alongside
		// the localized message (see $server/care-errors).
		interface Error {
			message: string;
			code?: string;
		}
	}
}
export {};
