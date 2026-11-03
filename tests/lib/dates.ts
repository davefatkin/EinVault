// The server runs with TZ=UTC; localDateISO() uses the process timezone (UTC),
// so "today" from the server's perspective is the current UTC date.
export function todayUTC(): string {
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`;
}

/**
 * A fixed-offset zone where it is about noon right now, far from both the
 * 09:00 celebration gate and midnight. Etc/GMT-N means UTC+N (POSIX sign).
 */
export function noonZone(): { tz: string; today: string } {
	const n = 12 - new Date().getUTCHours();
	const tz = n > 0 ? `Etc/GMT-${n}` : n < 0 ? `Etc/GMT+${-n}` : 'Etc/GMT';
	const today = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
	return { tz, today };
}
