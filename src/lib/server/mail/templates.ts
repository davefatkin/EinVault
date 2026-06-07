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
 * Escape the catalog text with placeholders still in it, then replace each
 * placeholder with its escaped value. escapeHtml never produces '{' or '}',
 * so placeholders survive escaping intact; the replacement callback keeps
 * '$'-patterns in values literal.
 */
function tHtml(
	locale: Locale,
	key: Parameters<typeof t>[1],
	params?: Record<string, string>
): string {
	let out = escapeHtml(t(locale, key));
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			out = out.replaceAll(`{${name}}`, () => escapeHtml(value));
		}
	}
	return out;
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
		<p>${tHtml(locale, 'email.reset.greeting', { name: user.displayName })}</p>
		<p>${tHtml(locale, 'email.reset.body', { username: user.username })}</p>
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

// Server TZ (the container's TZ env var) — consistent with how the app
// renders times elsewhere.
export function formatWhen(locale: Locale, when: Date): string {
	return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(when);
}

export function buildReminderEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	reminder: { title: string; description: string | null; dueAt: Date },
	companionName: string,
	link: string | null
): MailMessage {
	const greeting = t(locale, 'email.reminder.greeting', { name: user.displayName });
	const body = t(locale, 'email.reminder.body', {
		companion: companionName,
		title: reminder.title
	});
	const dueLine = t(locale, 'email.reminder.dueLine', { due: formatWhen(locale, reminder.dueAt) });
	const cta = t(locale, 'email.reminder.cta');
	const footer = t(locale, 'email.reminder.footer');

	const textParts = [greeting, body];
	if (reminder.description) textParts.push(reminder.description);
	textParts.push(dueLine);
	if (link) textParts.push(link);
	textParts.push(footer);

	const descriptionHtml = reminder.description
		? `\n\t\t<p>${escapeHtml(reminder.description)}</p>`
		: '';
	const ctaHtml = link
		? `\n\t\t<p style="margin: 24px 0;">\n\t\t\t<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>\n\t\t</p>`
		: '';

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.reminder.greeting', { name: user.displayName })}</p>
		<p>${tHtml(locale, 'email.reminder.body', { companion: companionName, title: reminder.title })}</p>${descriptionHtml}
		<p><strong>${escapeHtml(dueLine)}</strong></p>${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, 'email.reminder.subject', { title: reminder.title }),
		text: textParts.join('\n\n'),
		html
	};
}

export function buildShiftEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	kind: 'shiftStart' | 'shiftEnd',
	caretakerName: string,
	shift: { startAt: Date; endAt: Date },
	link: string | null
): MailMessage {
	const subjectKey = kind === 'shiftStart' ? 'email.shift.startSubject' : 'email.shift.endSubject';
	const bodyKey = kind === 'shiftStart' ? 'email.shift.startBody' : 'email.shift.endBody';
	const bodyParams: Record<string, string> =
		kind === 'shiftStart'
			? { caretaker: caretakerName, start: formatWhen(locale, shift.startAt) }
			: { caretaker: caretakerName, end: formatWhen(locale, shift.endAt) };

	const greeting = t(locale, 'email.reminder.greeting', { name: user.displayName });
	const body = t(locale, bodyKey, bodyParams);
	const cta = t(locale, 'email.reminder.cta');
	const footer = t(locale, 'email.shift.footer');

	const textParts = [greeting, body];
	if (link) textParts.push(link);
	textParts.push(footer);

	const ctaHtml = link
		? `\n\t\t<p style="margin: 24px 0;">\n\t\t\t<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>\n\t\t</p>`
		: '';

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.reminder.greeting', { name: user.displayName })}</p>
		<p>${tHtml(locale, bodyKey, bodyParams)}</p>${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, subjectKey, { caretaker: caretakerName }),
		text: textParts.join('\n\n'),
		html
	};
}
