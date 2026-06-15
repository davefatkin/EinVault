// In-process only; resets on restart. Good enough for brute-force slowdown.
// Does not coordinate across multiple processes — intentional for single-instance deployments.
const buckets = new Map<string, { count: number; resetAt: number }>();

const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

export function checkRateLimit(key: string, limit = 5, windowMs = 15 * 60 * 1000): boolean {
	const now = Date.now();

	if (now - lastCleanup > CLEANUP_INTERVAL_MS) {
		for (const [k, val] of buckets) {
			if (now > val.resetAt) buckets.delete(k);
		}
		lastCleanup = now;
	}

	const b = buckets.get(key);
	if (!b || now > b.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return true;
	}
	if (b.count >= limit) return false;
	b.count++;
	return true;
}

export function clearRateLimit(key: string): void {
	buckets.delete(key);
}
