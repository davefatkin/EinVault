import { encodeBase32LowerCaseNoPadding } from '@oslojs/encoding';

export function generateId(length: number = 15): string {
	const bytes = new Uint8Array(Math.ceil((length * 5) / 8));
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes).slice(0, length);
}
