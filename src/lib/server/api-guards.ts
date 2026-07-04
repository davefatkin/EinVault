import { error } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';
import { throwCareError } from '$lib/server/care-errors';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import type { ApiTokenScope } from '$lib/server/api-tokens';
import type { UserRole } from '$lib/server/validation';

// Shared guards for the Bearer API's read GETs, factored out so the same
// scope/companion checks can't drift across logs/health-events/weight/
// reminders/shifts/users.

// Reads require a full-scope token; write-only (log-only device) tokens get 403.
export function requireFullScope(scope: ApiTokenScope, locale: Locale): void {
	if (scope === 'write')
		error(403, { code: 'writeScopeReadOnly', message: t(locale, 'error.forbidden') });
}

// Reads scoped to one companion: require a `companionId` query param the token
// may access, else 400 noCompanions / 403 notAssigned. Returns the id.
export async function requireAllowedCompanion(
	url: URL,
	user: { id: string; role: UserRole },
	locale: Locale
): Promise<string> {
	const companionId = url.searchParams.get('companionId');
	if (!companionId)
		error(400, { code: 'noCompanions', message: t(locale, 'error.noCompanionsSelected') });
	const allowed = await listAllowedCompanions({ id: user.id, role: user.role });
	if (!allowed.includes(companionId)) throwCareError('notAssigned', locale);
	return companionId;
}
