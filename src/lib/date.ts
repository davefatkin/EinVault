/** Returns today's date as YYYY-MM-DD in the local (device/server) timezone. */
export function localDateISO(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
