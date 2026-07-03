import { error, type RequestEvent, type RequestHandler } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';
import { API_TOKENS_ENABLED } from '$lib/server/env';
import { resolveApiToken, touchApiToken } from '$lib/server/api-tokens';
import { checkRateLimit } from '$lib/server/auth/rate-limit';
import type { User } from '$lib/server/db/schema';

// Per-endpoint Bearer resolution, deliberately NOT a hooks handle: token
// requests never populate locals.user, so the twoFactorGate (which only acts
// when a user is present) can't block headless devices, and the session
// cookie machinery stays untouched.
export async function requireApiToken(
	event: RequestEvent
): Promise<{ user: User; tokenId: string }> {
	// Killswitch off → the route doesn't exist (same posture as the calendar feed).
	if (!API_TOKENS_ENABLED) error(404, 'Not found');

	// Pre-auth limiter by client IP so unknown-token spray stays cheap to shrug off.
	let ip = 'unknown';
	try {
		ip = event.getClientAddress();
	} catch {
		// adapter can throw when the address is unavailable; fall back to a shared bucket
	}
	if (!checkRateLimit(`api-ip:${ip}`, 30, 60 * 1000)) {
		error(429, t(event.locals.locale, 'error.rateLimited'));
	}

	const header = event.request.headers.get('authorization') ?? '';
	const match = /^Bearer\s+(.+)$/i.exec(header.trim());
	const resolved = match ? await resolveApiToken(match[1].trim()) : null;
	if (!resolved) {
		error(401, t(event.locals.locale, 'error.invalidToken'));
	}

	// Per-token limiter: generous enough for any sane device, tight enough to
	// keep a runaway loop from flooding the log tables.
	if (!checkRateLimit(`api-token:${resolved.tokenId}`, 120, 60 * 1000)) {
		error(429, t(event.locals.locale, 'error.rateLimited'));
	}

	await touchApiToken(resolved.tokenId);
	return resolved;
}

export type ApiContext = { event: RequestEvent; user: User; tokenId: string; locale: Locale };

// Wrap a Bearer-API handler: resolves + rate-limits the token (so the killswitch
// and limiter can't be forgotten on a new endpoint) and injects the locale.
export function apiRoute(handler: (ctx: ApiContext) => Promise<Response>): RequestHandler {
	return async (event) => {
		const { user, tokenId } = await requireApiToken(event);
		return handler({ event, user, tokenId, locale: event.locals.locale });
	};
}

// apiRoute + JSON body parse guarded by a type predicate; 400s with a stable
// `code` on a malformed or non-matching body before the handler runs.
export function apiRouteJson<B>(
	guard: (b: unknown) => b is B,
	handler: (ctx: ApiContext & { body: B }) => Promise<Response>
): RequestHandler {
	return apiRoute(async (ctx) => {
		const raw = await ctx.event.request.json().catch(() => null);
		if (!guard(raw)) {
			error(400, { code: 'invalidBody', message: t(ctx.locale, 'error.invalidRequestBody') });
		}
		return handler({ ...ctx, body: raw });
	});
}
