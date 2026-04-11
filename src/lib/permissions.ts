/**
 * Authorization helpers shared by client UI and server route handlers.
 * Keep logic here so the UI (button visibility) and API (403 check) cannot drift.
 */

type AuthUser = { id: string; role: 'admin' | 'member' | 'caretaker' } | null | undefined;

/**
 * Admins can delete any journal photo. Other users can delete only photos
 * they uploaded. Photos with a null `loggedBy` (pre-migration legacy rows)
 * are deletable only by admins.
 */
export function canDeletePhoto(user: AuthUser, photo: { loggedBy: string | null }): boolean {
	if (!user) return false;
	return user.role === 'admin' || photo.loggedBy === user.id;
}
