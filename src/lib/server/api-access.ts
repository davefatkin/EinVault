import type { User } from '$lib/server/db/schema';
import { isMailEnabled, sendMail } from '$lib/server/mail';
import { buildApiAccessChangedEmail } from '$lib/server/mail/templates';
import { isNtfyEnabled, sendNtfy } from '$lib/server/notify/ntfy';
import { t } from '$lib/i18n';

// Best-effort notification when an admin grants/revokes a user's API access.
// Rendered in the recipient's stored locale. Failures are logged, never
// surfaced; the toggle itself must not depend on SMTP/ntfy health.
export async function notifyApiAccessChanged(user: User, granted: boolean): Promise<void> {
	if (isMailEnabled() && user.email) {
		try {
			await sendMail(
				buildApiAccessChangedEmail(
					user.locale,
					{ displayName: user.displayName, email: user.email },
					granted
				)
			);
		} catch (err) {
			console.error(`[api-access] email notification for user ${user.id} failed:`, err);
		}
	}
	if (isNtfyEnabled() && user.ntfyTopic) {
		try {
			await sendNtfy(user.ntfyTopic, {
				title: t(
					user.locale,
					granted ? 'email.apiAccess.grantedSubject' : 'email.apiAccess.revokedSubject'
				),
				message: t(
					user.locale,
					granted ? 'email.apiAccess.grantedBody' : 'email.apiAccess.revokedBody'
				)
			});
		} catch (err) {
			console.error(`[api-access] ntfy notification for user ${user.id} failed:`, err);
		}
	}
}
