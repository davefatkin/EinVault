import { getVtimezoneComponent } from '@touch4it/ical-timezones';

export function icsDate(d: Date): string {
	return d
		.toISOString()
		.replace(/[-:]/g, '')
		.replace(/\.\d{3}/, '');
}

export function icsEscape(s: string): string {
	return s
		.replace(/\r\n|\r/g, '\n')
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\n/g, '\\n');
}

// RFC 5545 line folding: max 75 octets per line, continuations begin with a
// single space. Counts UTF-8 bytes and never splits a multi-byte sequence.
export function foldLine(line: string): string {
	const bytes = new TextEncoder().encode(line);
	if (bytes.length <= 75) return line;
	const dec = new TextDecoder();
	const out: string[] = [];
	let start = 0;
	let limit = 75; // continuations get 74 (leading space makes 75)
	while (start < bytes.length) {
		let end = Math.min(start + limit, bytes.length);
		while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // back off a continuation byte
		out.push(dec.decode(bytes.subarray(start, end)));
		start = end;
		limit = 74;
	}
	return out.join('\r\n ');
}

function partsInZone(d: Date, tz: string, withTime: boolean): Record<string, string> {
	const fmt = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : {})
	});
	const acc: Record<string, string> = {};
	for (const p of fmt.formatToParts(d)) if (p.type !== 'literal') acc[p.type] = p.value;
	return acc;
}

// YYYYMMDDTHHMMSS wall-clock in `tz` (for DTSTART;TZID=...).
export function icsLocal(d: Date, tz: string): string {
	const p = partsInZone(d, tz, true);
	return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

// YYYYMMDD calendar day in `tz` (for all-day VALUE=DATE).
export function icsDateOnly(d: Date, tz: string): string {
	const p = partsInZone(d, tz, false);
	return `${p.year}${p.month}${p.day}`;
}

// A complete VTIMEZONE component for an IANA zone, or null if unknown.
export function vtimezoneBlock(tz: string): string | null {
	try {
		const block = getVtimezoneComponent(tz);
		return block ? block.trim() : null;
	} catch {
		return null;
	}
}
