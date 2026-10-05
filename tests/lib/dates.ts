// The server runs with TZ=UTC; localDateISO() uses the process timezone (UTC),
// so "today" from the server's perspective is the current UTC date.
export function todayUTC(): string {
	const now = new Date();
	const p = (n: number) => String(n).padStart(2, '0');
	return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`;
}
