import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

function key(): Buffer {
	const raw = env.TWOFA_ENC_KEY;
	if (!raw) throw new Error('TWOFA_ENC_KEY is not set; 2FA secret encryption is unavailable.');
	const buf = Buffer.from(raw, 'base64');
	if (buf.length !== 32) throw new Error('TWOFA_ENC_KEY must be 32 bytes (base64-encoded).');
	return buf;
}

/** Returns "iv:ciphertext:authTag", each base64. */
export function encryptSecret(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
	const [ivB64, ctB64, tagB64] = stored.split(':');
	if (!ivB64 || !ctB64 || !tagB64) throw new Error('Malformed encrypted TOTP secret.');
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
	decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
	return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString(
		'utf8'
	);
}

export function isTwoFactorConfigured(): boolean {
	const raw = env.TWOFA_ENC_KEY;
	return !!raw && Buffer.from(raw, 'base64').length === 32;
}
