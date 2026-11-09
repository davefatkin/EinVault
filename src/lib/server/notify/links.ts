import * as env from '$app/env/private';

// Deep links need a configured public origin; without one the email simply
// has no button (boot already warns about ORIGIN when SMTP is on).
export function publicLink(path: string): string | null {
	const origin = env.ORIGIN?.trim().replace(/\/$/, '') || null;
	return origin ? `${origin}${path}` : null;
}
