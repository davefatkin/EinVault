import { fail } from '@sveltejs/kit';
import { t } from '$lib/i18n';
import type { Locale } from '$lib/i18n';
import { failCareError } from '$lib/server/care-errors';
import {
	parseDailyEventType,
	parseDurationMinutes,
	parseIdArray,
	parseShortName,
	type UserRole
} from '$lib/server/validation';
import {
	createQuickLog,
	updateQuickLog,
	deleteQuickLog,
	setQuickLogEnabled,
	moveQuickLog,
	shareQuickLog,
	executeQuickLog,
	type QuickLogInput
} from '$lib/server/quick-logs';

// Shared form-action bodies (account.ts pattern): the (app) settings route and
// the caretaker /care/settings twin both delegate here so behavior can't drift.

type ActionUser = { id: string; role: UserRole };

function parseQuickLogForm(
	data: FormData,
	locale: Locale
): { input: QuickLogInput } | { error: ReturnType<typeof fail> } {
	const name = parseShortName(data.get('name'));
	const type = parseDailyEventType(String(data.get('type') ?? ''));
	if (!name) return { error: fail(400, { quickLogError: t(locale, 'error.nameRequired') }) };
	if (!type) return { error: fail(400, { quickLogError: t(locale, 'error.typeRequired') }) };

	const companionIds = parseIdArray(data.getAll('companionIds').map(String));
	if (companionIds.length === 0) {
		return { error: fail(400, { quickLogError: t(locale, 'error.noCompanionsSelected') }) };
	}

	return {
		input: {
			name,
			type,
			durationMinutes: parseDurationMinutes(data.get('durationMinutes')),
			note: String(data.get('note') ?? '').trim() || null,
			isEnabled: data.get('isEnabled') !== 'false',
			companionIds
		}
	};
}

export async function handleQuickLogCreate(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const parsed = parseQuickLogForm(data, locale);
	if ('error' in parsed) return parsed.error;
	await createQuickLog(user, parsed.input);
	return { quickLogSaved: true };
}

export async function handleQuickLogUpdate(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { quickLogError: t(locale, 'error.missingId') });
	const parsed = parseQuickLogForm(data, locale);
	if ('error' in parsed) return parsed.error;
	const ok = await updateQuickLog(user, id, parsed.input);
	if (!ok) return fail(404, { quickLogError: t(locale, 'error.quickLogNotFound') });
	return { quickLogSaved: true };
}

export async function handleQuickLogDelete(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { quickLogError: t(locale, 'error.missingId') });
	const ok = await deleteQuickLog(user.id, id);
	if (!ok) return fail(404, { quickLogError: t(locale, 'error.quickLogNotFound') });
	return { quickLogDeleted: true };
}

export async function handleQuickLogToggle(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { quickLogError: t(locale, 'error.missingId') });
	const ok = await setQuickLogEnabled(user.id, id, data.get('enabled') === 'true');
	if (!ok) return fail(404, { quickLogError: t(locale, 'error.quickLogNotFound') });
	return { quickLogSaved: true };
}

export async function handleQuickLogMove(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	const dir = String(data.get('dir') ?? '');
	if (!id || (dir !== 'up' && dir !== 'down')) {
		return fail(400, { quickLogError: t(locale, 'error.missingId') });
	}
	await moveQuickLog(user.id, id, dir);
	return { quickLogSaved: true };
}

export async function handleQuickLogShare(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('id') ?? '').trim();
	if (!id) return fail(400, { quickLogError: t(locale, 'error.missingId') });
	const recipients = parseIdArray(data.getAll('recipientIds').map(String));
	if (recipients.length === 0) {
		return fail(400, { quickLogError: t(locale, 'error.noRecipientsSelected') });
	}
	const copied = await shareQuickLog(user.id, id, recipients);
	if (copied === 0) return fail(404, { quickLogError: t(locale, 'error.quickLogNotFound') });
	return { quickLogShared: copied };
}

export async function handleQuickLogExecute(user: ActionUser, request: Request, locale: Locale) {
	const data = await request.formData();
	const id = String(data.get('quickLogId') ?? '').trim();
	if (!id) return fail(400, { quickLogError: t(locale, 'error.missingId') });

	const companionIds = parseIdArray(data.getAll('companionIds').map(String));
	if (companionIds.length === 0) {
		return fail(400, { quickLogError: t(locale, 'page.log.selectAtLeastOne') });
	}

	const result = await executeQuickLog({
		user,
		quickLogId: id,
		companionIds,
		rememberSelection: data.get('remember') === 'on'
	});
	if (!result.ok) return failCareError(result.code, locale, 'quickLogError');
	return { quickLogExecuted: id };
}
