import { publicOrigin } from '#lib/server/env.js';

// Deep links need a configured public origin; without one the email simply
// has no button (boot already warns about ORIGIN when SMTP is on).
export function publicLink(path: string): string | null {
	const origin = publicOrigin();
	return origin ? `${origin}${path}` : null;
}
