import { browser } from '$app/env';
import { parseYmd, daysInMonth } from '#lib/date.js';

export interface CelebrationInput {
	id: string;
	name: string;
	avatarPath: string | null;
	dob: string | null;
	dobApproximate: boolean;
	homecomingDate: string | null;
	isActive: boolean;
}

export interface Celebration {
	birthdayYears?: number;
	homecomingYears?: number;
}

export interface BannerEntry extends Celebration {
	companionId: string;
	name: string;
	avatarPath: string | null;
}

export const CELEBRATION_COOKIE = 'einvault_celebration_dismissed';

/** Whole years since `date` when today is its anniversary (Feb 29 counts on Feb 28 in
 *  non-leap years), else null. Years must be at least 1. */
function anniversaryYears(date: string | null, today: string): number | null {
	const a = parseYmd(date);
	const t = parseYmd(today);
	if (!a || !t) return null;
	const years = t.y - a.y;
	if (years < 1) return null;
	const sameDay = a.m === t.m && a.d === t.d;
	const leapBaby = a.m === 2 && a.d === 29 && t.m === 2 && t.d === 28 && daysInMonth(t.y, 2) === 28;
	return sameDay || leapBaby ? years : null;
}

export function celebrationOn(
	c: Omit<CelebrationInput, 'id' | 'name' | 'avatarPath'>,
	today: string
): Celebration | null {
	if (!c.isActive) return null;
	const out: Celebration = {};
	if (!c.dobApproximate) {
		const y = anniversaryYears(c.dob, today);
		if (y !== null) out.birthdayYears = y;
	}
	const h = anniversaryYears(c.homecomingDate, today);
	if (h !== null) out.homecomingYears = h;
	return out.birthdayYears !== undefined || out.homecomingYears !== undefined ? out : null;
}

export function dismissToken(companionId: string, today: string): string {
	return `${companionId}:${today}`;
}

function parseTokens(cookie: string | undefined): string[] {
	if (!cookie) return [];
	let raw = cookie;
	try {
		raw = decodeURIComponent(cookie);
	} catch {
		// keep the raw value
	}
	return raw
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);
}

export function celebrationBanner(
	companions: CelebrationInput[],
	today: string,
	cookie: string | undefined
): BannerEntry[] {
	const dismissed = new Set(parseTokens(cookie));
	const out: BannerEntry[] = [];
	for (const c of companions) {
		if (dismissed.has(dismissToken(c.id, today))) continue;
		const cel = celebrationOn(c, today);
		if (cel) out.push({ companionId: c.id, name: c.name, avatarPath: c.avatarPath, ...cel });
	}
	return out;
}

/** Appends today's dismiss token (2d, SameSite=Lax). Drops tokens from other days. */
export function writeDismissCookie(companionId: string, today: string): void {
	if (!browser) return;
	const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${CELEBRATION_COOKIE}=([^;]*)`));
	const kept = parseTokens(m?.[1]).filter((t) => t.endsWith(`:${today}`));
	const tokens = [...new Set([...kept, dismissToken(companionId, today)])];
	document.cookie = `${CELEBRATION_COOKIE}=${encodeURIComponent(tokens.join(','))};path=/;max-age=172800;SameSite=Lax`;
}
