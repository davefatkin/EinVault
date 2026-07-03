import { fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { t, type Locale } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { API_TOKENS_ENABLED } from '$lib/server/env';
import { parseShortName } from '$lib/server/validation';
import {
	createApiToken,
	revokeApiToken,
	countApiTokens,
	MAX_API_TOKENS_PER_USER,
	type ApiTokenScope
} from '$lib/server/api-tokens';

// Shared bodies for the api-token settings actions (account.ts pattern): the
// (app) settings route and the caretaker /care/settings twin delegate here so
// token-creation policy (kill-switch, access recheck, per-user cap) can't drift.

async function hasApiAccess(userId: string): Promise<boolean> {
	const fresh = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
	return !!fresh?.apiAccessEnabled;
}

function parseScope(value: string | File | null): ApiTokenScope {
	return value === 'write' ? 'write' : 'full';
}

// Optional expiry in days → an absolute Date, or null (never expires).
function parseExpiry(value: string | File | null): Date | null {
	const days = parseInt(String(value ?? ''), 10);
	if (!Number.isInteger(days) || days < 1) return null;
	return new Date(Date.now() + Math.min(days, 3650) * 24 * 60 * 60 * 1000);
}

export async function handleApiTokenCreate(userId: string, request: Request, locale: Locale) {
	if (!API_TOKENS_ENABLED) return fail(403);
	if (!(await hasApiAccess(userId))) {
		return fail(403, { apiTokenError: t(locale, 'error.apiAccessRevoked') });
	}
	if ((await countApiTokens(userId)) >= MAX_API_TOKENS_PER_USER) {
		return fail(400, {
			apiTokenError: t(locale, 'error.tokenLimitReached', { max: MAX_API_TOKENS_PER_USER })
		});
	}
	const data = await request.formData();
	const name = parseShortName(data.get('name'));
	if (!name) return fail(400, { apiTokenError: t(locale, 'error.nameRequired') });

	const { id, raw } = await createApiToken(userId, name, {
		scope: parseScope(data.get('scope')),
		expiresAt: parseExpiry(data.get('expiresInDays'))
	});
	// Raw token is returned exactly once for display; only the hash is stored.
	return { apiTokenRaw: raw, apiTokenId: id };
}

export async function handleApiTokenRevoke(userId: string, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { apiTokenError: t(locale, 'error.missingId') });
	const ok = await revokeApiToken(userId, id);
	if (!ok) return fail(404, { apiTokenError: t(locale, 'error.entryNotFound') });
	return { apiTokenRevoked: true };
}

// Rotate = mint a fresh token that inherits the old one's name + scope, then
// revoke the old, in a transaction. Lets a device be re-keyed without losing
// its configured scope. Does not count against the cap (net token count is
// unchanged).
export async function handleApiTokenRotate(userId: string, request: Request, locale: Locale) {
	if (!API_TOKENS_ENABLED) return fail(403);
	if (!(await hasApiAccess(userId))) {
		return fail(403, { apiTokenError: t(locale, 'error.apiAccessRevoked') });
	}
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { apiTokenError: t(locale, 'error.missingId') });

	const old = await db.query.apiTokens.findFirst({
		where: and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, userId))
	});
	if (!old) return fail(404, { apiTokenError: t(locale, 'error.entryNotFound') });

	const { id: newId, raw } = await createApiToken(userId, old.name, { scope: old.scope });
	await revokeApiToken(userId, id);
	return { apiTokenRaw: raw, apiTokenId: newId, apiTokenRotated: true };
}
