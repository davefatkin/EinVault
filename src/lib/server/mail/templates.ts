import { t, type Locale } from '#lib/i18n/index.js';
import type { MailMessage } from '#lib/server/mail/index.js';
import type { Severity } from '#lib/incidents.js';
import { celebrationLines, type Celebration } from '#lib/celebrations.js';
import { daysUntil } from '#lib/reminderLeadTimes.js';
import { formatDateOnly, formatYmd } from '#lib/date.js';
import { formatRunOut } from '#lib/supplies.js';

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

type ReminderMailInput = { title: string; description: string | null; dueAt: Date };

/** Shared body of the due and heads-up reminder emails; only the copy differs. */
function reminderMessage(
	locale: Locale,
	user: { displayName: string; email: string },
	reminder: ReminderMailInput,
	companionName: string,
	link: string | null,
	copy: {
		subject: string;
		bodyKey: 'email.reminder.body' | 'email.reminderUpcoming.body';
		dueLineKey: 'email.reminder.dueLine' | 'email.reminderUpcoming.dueLine';
	}
): MailMessage {
	const greeting = t(locale, 'email.reminder.greeting', { name: user.displayName });
	const body = t(locale, copy.bodyKey, {
		companion: companionName,
		title: reminder.title
	});
	const dueLine = t(locale, copy.dueLineKey, { due: formatWhen(locale, reminder.dueAt) });
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
		<p>${tHtml(locale, copy.bodyKey, { companion: companionName, title: reminder.title })}</p>${descriptionHtml}
		<p><strong>${escapeHtml(dueLine)}</strong></p>${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: copy.subject,
		text: textParts.join('\n\n'),
		html
	};
}

export function buildReminderEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	reminder: ReminderMailInput,
	companionName: string,
	link: string | null
): MailMessage {
	return reminderMessage(locale, user, reminder, companionName, link, {
		subject: t(locale, 'email.reminder.subject', { title: reminder.title }),
		bodyKey: 'email.reminder.body',
		dueLineKey: 'email.reminder.dueLine'
	});
}

/**
 * Heads-up subject and ntfy title, worded from the local calendar days left
 * at delivery (not the lead value), so a late delivery never says the wrong
 * thing. Callers only send before the due time, so the count is never negative.
 */
export function reminderUpcomingSubject(
	locale: Locale,
	title: string,
	dueAt: Date,
	now: Date
): string {
	const days = daysUntil(dueAt, now);
	if (days <= 0) return t(locale, 'email.reminderUpcoming.subjectToday', { title });
	if (days === 1) return t(locale, 'email.reminderUpcoming.subjectTomorrow', { title });
	return t(locale, 'email.reminderUpcoming.subjectDays', { title, days });
}

export function buildReminderUpcomingEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	reminder: ReminderMailInput,
	companionName: string,
	link: string | null,
	now: Date
): MailMessage {
	return reminderMessage(locale, user, reminder, companionName, link, {
		subject: reminderUpcomingSubject(locale, reminder.title, reminder.dueAt, now),
		bodyKey: 'email.reminderUpcoming.body',
		dueLineKey: 'email.reminderUpcoming.dueLine'
	});
}

export function buildTestEmail(
	locale: Locale,
	user: { displayName: string; email: string }
): MailMessage {
	const greeting = t(locale, 'email.reminder.greeting', { name: user.displayName });
	const body = t(locale, 'email.test.body');

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.reminder.greeting', { name: user.displayName })}</p>
		<p>${escapeHtml(body)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, 'email.test.subject'),
		text: `${greeting}\n\n${body}`,
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

export function buildCelebrationEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	companionName: string,
	c: Celebration,
	link: string | null
): MailMessage {
	const greeting = t(locale, 'email.celebration.greeting', { name: user.displayName });
	const lines = celebrationLines(locale, companionName, c);
	const cta = t(locale, 'email.celebration.cta');
	const footer = t(locale, 'email.celebration.footer');

	const textParts = [greeting, ...lines];
	if (link) textParts.push(link);
	textParts.push(footer);

	const linesHtml = lines.map((line) => `\n\t\t<p>${escapeHtml(line)}</p>`).join('');
	const ctaHtml = link
		? `\n\t\t<p style="margin: 24px 0;">\n\t\t\t<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>\n\t\t</p>`
		: '';

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.celebration.greeting', { name: user.displayName })}</p>${linesHtml}${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, 'email.celebration.subject', { name: companionName }),
		text: textParts.join('\n\n'),
		html
	};
}

export type IncidentAlertKind = 'incidentLogged' | 'incidentUpdated';

/** Lines shared by the email and the ntfy push: what happened, the incident, its severity. */
export function incidentAlertLines(
	locale: Locale,
	kind: IncidentAlertKind,
	companionName: string,
	title: string,
	severity: Severity | null
): string[] {
	const lines = [
		t(
			locale,
			kind === 'incidentLogged' ? 'email.incident.loggedBody' : 'email.incident.updatedBody',
			{ companion: companionName }
		),
		t(locale, 'email.incident.titleLine', { title })
	];
	if (severity) {
		lines.push(
			t(locale, 'email.incident.severityLine', { severity: t(locale, `enum.severity.${severity}`) })
		);
	}
	return lines;
}

const INCIDENT_TEXT_MAX = 1000;

export function buildIncidentEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	a: {
		kind: IncidentAlertKind;
		companionName: string;
		title: string;
		severity: Severity | null;
		text: string | null;
	},
	link: string | null
): MailMessage {
	const greeting = t(locale, 'email.incident.greeting', { name: user.displayName });
	const lines = incidentAlertLines(locale, a.kind, a.companionName, a.title, a.severity);
	const text = a.text?.trim()
		? a.text.trim().length > INCIDENT_TEXT_MAX
			? `${a.text.trim().slice(0, INCIDENT_TEXT_MAX)}…`
			: a.text.trim()
		: null;
	const cta = t(locale, 'email.incident.cta');
	const footer = t(locale, 'email.incident.footer');

	const textParts = [greeting, lines.join('\n')];
	if (text) textParts.push(text);
	if (link) textParts.push(link);
	textParts.push(footer);

	const linesHtml = lines.map((line) => `\n\t\t<p>${escapeHtml(line)}</p>`).join('');
	const textHtml = text ? `\n\t\t<p style="white-space: pre-wrap;">${escapeHtml(text)}</p>` : '';
	const ctaHtml = link
		? `\n\t\t<p style="margin: 24px 0;">\n\t\t\t<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>\n\t\t</p>`
		: '';

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.incident.greeting', { name: user.displayName })}</p>${linesHtml}${textHtml}${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(
			locale,
			a.kind === 'incidentLogged'
				? 'email.incident.loggedSubject'
				: 'email.incident.updatedSubject',
			{ name: a.companionName, title: a.title }
		),
		text: textParts.join('\n\n'),
		html
	};
}

export type SupplyAlert =
	| { kind: 'supplyRunOut'; daysLeft: number; runOutOn: string }
	| { kind: 'supplyLowStock'; quantity: number; unit: string | null }
	| { kind: 'supplyExpiry'; expiresOn: string };

export interface SupplyAlertInput {
	name: string;
	companionNames: string[];
	alert: SupplyAlert;
}

/** "Running low: Carprofen, about 7 days left", "Running low: Poop bags", "Expiring soon: Eye drops, expires Nov 23". */
export function supplyAlertSubject(locale: Locale, s: SupplyAlertInput): string {
	const a = s.alert;
	if (a.kind === 'supplyRunOut') {
		return a.daysLeft <= 0
			? t(locale, 'email.supply.outSubject', { name: s.name })
			: t(locale, 'email.supply.runOutSubject', {
					name: s.name,
					left: formatRunOut(locale, a.daysLeft)
				});
	}
	if (a.kind === 'supplyLowStock') return t(locale, 'email.supply.lowSubject', { name: s.name });
	return t(locale, 'email.supply.expirySubject', {
		name: s.name,
		date: formatYmd(a.expiresOn, locale, { month: 'short', day: 'numeric' }) ?? a.expiresOn
	});
}

/** The body line shared by the email and the ntfy push. */
export function supplyAlertLine(locale: Locale, s: SupplyAlertInput): string {
	const a = s.alert;
	const params = {
		name: s.name,
		companions: new Intl.ListFormat(locale, { type: 'conjunction' }).format(s.companionNames)
	};
	if (a.kind === 'supplyRunOut') {
		return a.daysLeft <= 0
			? t(locale, 'email.supply.outBody', params)
			: t(locale, 'email.supply.runOutBody', {
					...params,
					date: formatDateOnly(a.runOutOn, locale) ?? a.runOutOn
				});
	}
	if (a.kind === 'supplyLowStock') {
		const amount = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(a.quantity);
		return t(locale, 'email.supply.lowBody', {
			...params,
			count: a.unit ? `${amount} ${a.unit}` : amount
		});
	}
	return t(locale, 'email.supply.expiryBody', {
		...params,
		date: formatDateOnly(a.expiresOn, locale) ?? a.expiresOn
	});
}

export function buildSupplyAlertEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	s: SupplyAlertInput,
	link: string | null
): MailMessage {
	const greeting = t(locale, 'email.supply.greeting', { name: user.displayName });
	const line = supplyAlertLine(locale, s);
	const cta = t(locale, 'email.supply.cta');
	const footer = t(locale, 'email.supply.footer');

	const textParts = [greeting, line];
	if (link) textParts.push(link);
	textParts.push(footer);

	const ctaHtml = link
		? `\n\t\t<p style="margin: 24px 0;">\n\t\t\t<a href="${escapeHtml(link)}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 10px 18px; border-radius: 6px; text-decoration: none;">${escapeHtml(cta)}</a>\n\t\t</p>`
		: '';

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.supply.greeting', { name: user.displayName })}</p>
		<p>${escapeHtml(line)}</p>${ctaHtml}
		<p style="font-size: 12px; color: #666;">${escapeHtml(footer)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: supplyAlertSubject(locale, s),
		text: textParts.join('\n\n'),
		html
	};
}

export function buildApiAccessChangedEmail(
	locale: Locale,
	user: { displayName: string; email: string },
	granted: boolean
): MailMessage {
	const subjectKey = granted ? 'email.apiAccess.grantedSubject' : 'email.apiAccess.revokedSubject';
	const bodyKey = granted ? 'email.apiAccess.grantedBody' : 'email.apiAccess.revokedBody';

	const greeting = t(locale, 'email.reminder.greeting', { name: user.displayName });
	const body = t(locale, bodyKey);

	const html = `<!doctype html>
<html>
	<body style="font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #222;">
		<p>${tHtml(locale, 'email.reminder.greeting', { name: user.displayName })}</p>
		<p>${escapeHtml(body)}</p>
	</body>
</html>`;

	return {
		to: user.email,
		subject: t(locale, subjectKey),
		text: `${greeting}\n\n${body}`,
		html
	};
}
