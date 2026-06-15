import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
	generateSecret,
	provisioningUri,
	verifyCode,
	generateBackupCodes,
	hashBackupCode
} from './totp';
import { encryptSecret, decryptSecret } from './totp-crypto';
import QRCode from 'qrcode';

/** Begin: store a pending (encrypted) secret, return QR + manual key. */
export async function beginEnrollment(userId: string, accountName: string) {
	const secret = generateSecret();
	await db
		.update(schema.users)
		.set({ totpSecret: encryptSecret(secret), totpEnabledAt: null, totpLastStep: null })
		.where(eq(schema.users.id, userId));
	const uri = provisioningUri(secret, accountName);
	const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
	return { manualKey: secret, qr };
}

/** Confirm: verify a code against the pending secret, enable, return backup codes (once). */
export async function confirmEnrollment(userId: string, code: string): Promise<string[] | null> {
	const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
	if (!user?.totpSecret) return null;
	const res = verifyCode(decryptSecret(user.totpSecret), code);
	if (!res.valid) return null;
	const codes = generateBackupCodes();
	await db.transaction((tx) => {
		tx.update(schema.users)
			.set({ totpEnabledAt: new Date(), totpLastStep: res.step })
			.where(eq(schema.users.id, userId))
			.run();
		tx.delete(schema.totpBackupCodes).where(eq(schema.totpBackupCodes.userId, userId)).run();
		tx.insert(schema.totpBackupCodes)
			.values(codes.map((c) => ({ id: randomUUID(), userId, codeHash: hashBackupCode(c) })))
			.run();
	});
	return codes;
}

export async function regenerateBackupCodes(userId: string): Promise<string[]> {
	const codes = generateBackupCodes();
	await db.transaction((tx) => {
		tx.delete(schema.totpBackupCodes).where(eq(schema.totpBackupCodes.userId, userId)).run();
		tx.insert(schema.totpBackupCodes)
			.values(codes.map((c) => ({ id: randomUUID(), userId, codeHash: hashBackupCode(c) })))
			.run();
	});
	return codes;
}

/** Disable: verify a fresh code first (caller enforces enforcement policy). */
export async function disableTwoFactor(userId: string, code: string): Promise<boolean> {
	const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
	if (!user?.totpSecret) return false;
	const res = verifyCode(decryptSecret(user.totpSecret), code, {
		lastStep: user.totpLastStep ?? undefined
	});
	if (!res.valid) return false;
	await db.transaction((tx) => {
		tx.update(schema.users)
			.set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null })
			.where(eq(schema.users.id, userId))
			.run();
		tx.delete(schema.totpBackupCodes).where(eq(schema.totpBackupCodes.userId, userId)).run();
	});
	return true;
}

/** Admin reset: no code required (escape hatch). */
export async function adminResetTwoFactor(userId: string): Promise<void> {
	await db.transaction((tx) => {
		tx.update(schema.users)
			.set({ totpSecret: null, totpEnabledAt: null, totpLastStep: null })
			.where(eq(schema.users.id, userId))
			.run();
		tx.delete(schema.totpBackupCodes).where(eq(schema.totpBackupCodes.userId, userId)).run();
	});
}
