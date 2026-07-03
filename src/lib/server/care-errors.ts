import { error, fail } from '@sveltejs/kit';
import { t, type Locale } from '$lib/i18n';
import type { MessageKey } from '$lib/i18n/en';

// The single source of truth for how a companion-care failure maps to an HTTP
// status and a localized message. Both the form actions and the Bearer API map
// through here so the two paths can't drift (they previously hand-rolled five
// separate ternary tables that had already diverged).
export type CareErrorCode = 'notFound' | 'disabled' | 'noTargets' | 'noActiveShift' | 'notAssigned';

export const CARE_ERROR: Record<CareErrorCode, { status: number; key: MessageKey }> = {
	notFound: { status: 404, key: 'error.quickLogNotFound' },
	disabled: { status: 403, key: 'error.quickLogDisabled' },
	noTargets: { status: 400, key: 'error.noValidTargets' },
	noActiveShift: { status: 403, key: 'error.noActiveShift' },
	notAssigned: { status: 403, key: 'error.notAssignedToCompanion' }
};

// Bearer-API path: throws an HttpError whose JSON body is { code, message }.
// SvelteKit serializes that object directly for +server.ts routes; the `code`
// gives devices a stable, locale-independent branch key.
export function throwCareError(code: CareErrorCode, locale: Locale): never {
	const { status, key } = CARE_ERROR[code];
	error(status, { code, message: t(locale, key) });
}

// Form-action path: returns a fail() with the localized message under the
// caller-supplied form key (templates read e.g. form?.quickLogError). Generic
// over the key so the ActionData shape stays narrow (Record<K, string>) rather
// than collapsing to a wide index signature.
export function failCareError<K extends string>(code: CareErrorCode, locale: Locale, formKey: K) {
	const { status, key } = CARE_ERROR[code];
	return fail(status, { [formKey]: t(locale, key) } as Record<K, string>);
}
