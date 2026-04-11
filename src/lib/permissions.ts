/**
 * Authorization helpers shared by client UI and server route handlers.
 * Keep logic here so the UI (button visibility) and API (403 check) cannot drift.
 */

type AuthUser = { id: string; role: 'admin' | 'member' | 'caretaker' } | null | undefined;

/**
 * Admins can modify (edit caption, delete) any journal photo. Other users
 * can modify only photos they uploaded. Photos with a null `loggedBy`
 * (pre-migration legacy rows) are modifiable only by admins.
 */
export function canModifyPhoto(user: AuthUser, photo: { loggedBy: string | null }): boolean {
	if (!user) return false;
	return user.role === 'admin' || photo.loggedBy === user.id;
}
