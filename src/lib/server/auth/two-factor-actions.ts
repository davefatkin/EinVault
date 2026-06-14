import { fail } from '@sveltejs/kit';
import type { Locale } from '$lib/i18n';
import { t } from '$lib/i18n';
import { isTwoFactorConfigured, decryptSecret } from './totp-crypto';
import { verifyCode } from './totp';
import {
	beginEnrollment,
	confirmEnrollment,
	regenerateBackupCodes,
	disableTwoFactor
} from './enrollment';
import { getAppSettings } from '$lib/server/app-settings';
import { requiresTwoFactor } from './two-factor';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

interface TwoFactorActionContext {
	user: {
		id: string;
		username: string;
		role: 'admin' | 'member' | 'caretaker';
		isOidc: boolean;
		totpEnabled: boolean;
	};
	request: Request;
	locale: Locale;
}

export async function totpBegin({ user, locale }: TwoFactorActionContext) {
	if (!isTwoFactorConfigured()) {
		return fail(400, { totpError: t(locale, 'page.settings.twofaUnavailable') });
	}
	if (user.totpEnabled) {
		return fail(400, { totpError: t(locale, 'page.settings.reenrollNote') });
	}
	const { qr, manualKey } = await beginEnrollment(user.id, user.username);
	return { totpQr: qr, totpManualKey: manualKey };
}

export async function totpConfirm({ user, request, locale }: TwoFactorActionContext) {
	const data = await request.formData();
	const code = String(data.get('code') ?? '');
	const codes = await confirmEnrollment(user.id, code);
	if (codes === null) {
		return fail(400, { totpError: t(locale, 'page.twofa.invalidCode') });
	}
	return { totpBackupCodes: codes, totpSuccess: true };
}

export async function totpRegenerate({ user, request, locale }: TwoFactorActionContext) {
	const data = await request.formData();
	const code = String(data.get('code') ?? '');
	const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id) });
	if (!row?.totpSecret) {
		return fail(400, { totpError: t(locale, 'page.twofa.invalidCode') });
	}
	const result = verifyCode(decryptSecret(row.totpSecret), code, {
		lastStep: row.totpLastStep ?? undefined
	});
	if (!result.valid) {
		return fail(400, { totpError: t(locale, 'page.twofa.invalidCode') });
	}
	const codes = await regenerateBackupCodes(user.id);
	return { totpBackupCodes: codes };
}

export async function totpDisable({ user, request, locale }: TwoFactorActionContext) {
	const { require2fa } = await getAppSettings();
	if (requiresTwoFactor({ role: user.role, isOidc: user.isOidc, totpEnabled: false }, require2fa)) {
		return fail(400, { totpError: t(locale, 'page.twofa.cannotDisableEnforced') });
	}
	const data = await request.formData();
	const code = String(data.get('code') ?? '');
	const ok = await disableTwoFactor(user.id, code);
	if (!ok) {
		return fail(400, { totpError: t(locale, 'page.twofa.invalidCode') });
	}
	return { totpSuccess: true };
}
