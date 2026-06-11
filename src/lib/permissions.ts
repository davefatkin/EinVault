/**
 * Authorization helpers shared by client UI and server route handlers.
 * Keep logic here so the UI (button visibility) and API (403 check) cannot drift.
 */

type AuthUser = { id: string; role: 'admin' | 'member' | 'caretaker' } | null | undefined;

/**
 * Admins can modify (edit caption, delete) any journal media item. Other users
 * can modify only items they uploaded. Items with a null `loggedBy`
 * (pre-migration legacy rows) are modifiable only by admins.
 */
export function canModifyMedia(user: AuthUser, item: { loggedBy: string | null }): boolean {
	if (!user) return false;
	return user.role === 'admin' || item.loggedBy === user.id;
}
