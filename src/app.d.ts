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
				email: string | null;
				phone: string | null;
			} | null;
			session: {
				id: string;
				userId: string;
				fresh: boolean;
				expiresAt: Date;
			} | null;
		}
		interface PageData {
			user?: App.Locals['user'];
		}
	}
}
export {};
