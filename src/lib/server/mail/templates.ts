import { t, type Locale } from '$lib/i18n';
import type { MailMessage } from '$lib/server/mail';

// displayName/username are user-controlled; escape anything interpolated into
// the HTML body so a crafted name cannot inject markup into the email.
function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}

/**
 * Interpolate one {param} into a message AFTER escaping both the message and
 * the value, so localized text and user-controlled values are both HTML-safe.
 */
function tHtml(locale: Locale, key: Parameters<typeof t>[1], param?: [string, string]): string {
	if (!param) return escapeHtml(t(locale, key));
	const [name, value] = param;
	// Escape the catalog text with the placeholder still in it, then replace the
	// placeholder with the escaped value. escapeHtml never produces '{' or '}',
	// so the placeholder survives escaping intact.
	return escapeHtml(t(locale, key)).replaceAll(`{${name}}`, () => escapeHtml(value));
}

export function buildResetEmail(
	locale: Locale,
	user: { displayName: string; username: string; email: string },
	link: string
): MailMessage {
	const greeting = t(locale, 'email.reset.greeting', { name: user.displayName });
	const body = t(locale, 'email.reset.body', { username: user.username });
	const cta = t(locale, 'email.reset.cta');
	const ignore = t(locale, 'email.reset.ignore');

	const text = `${greeting}\n\n${body}\n\n${link}\n\n${ignore}`;

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.reset.greeting', ['name', user.displayName])}</p>
		<p>${tHtml(locale, 'email.reset.body', ['username', user.username])}</p>
		<p style="margin: 24px 0;">
			<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>
		</p>
		<p style="font-size: 12px; color: #666; word-break: break-all;">${escapeHtml(link)}</p>
		<p style="font-size: 12px; color: #666;">${escapeHtml(ignore)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, 'email.reset.subject'),
		text,
		html
	};
}
