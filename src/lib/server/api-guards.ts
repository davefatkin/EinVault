import { error } from '@sveltejs/kit';
import { t, type Locale } from '#lib/i18n/index.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { listAllowedCompanions } from '#lib/server/companion-scope.js';
import type { ApiTokenScope } from '#lib/server/api-tokens.js';
import type { UserRole } from '#lib/server/validation.js';

// Shared guards for the Bearer API's read GETs, factored out so the same
// scope/companion checks can't drift across logs/health-events/weight/
// reminders/shifts/users.

// Reads require a full-scope token; write-only (log-only device) tokens get 403.
export function requireFullScope(scope: ApiTokenScope, locale: Locale): void {
	if (scope === 'write') error(403, t(locale, 'error.forbidden'), { code: 'writeScopeReadOnly' });
}

// Reads scoped to one companion: require a `companionId` query param the token
// may access, else 400 noCompanions / 403 notAssigned. Returns the id.
export async function requireAllowedCompanion(
	url: URL,
	user: { id: string; role: UserRole },
	locale: Locale
): Promise<string> {
	const companionId = url.searchParams.get('companionId');
	if (!companionId) error(400, t(locale, 'error.noCompanionsSelected'), { code: 'noCompanions' });
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);
	return companionId;
}
