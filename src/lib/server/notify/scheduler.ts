// Notification scheduler (issue #12). A 60-second in-process interval that
// (a) produces outbox rows for newly-due reminders and for shifts entering
// the 24h lead window, then (b) drains the queue through SMTP. Single-flight
// like the video worker: overlapping ticks are no-ops. Single-process
// assumption: the in-memory flag and the select-then-claim pattern both
// presume one app process per database — the same accepted constraint as the
// video worker.
// Delivery is at-least-once: a crash between sendMail and markSent re-sends that one notification after boot recovery — accepted trade-off.
import { and, eq, gt, isNotNull, isNull, lte } from 'drizzle-orm';
import * as env from '$app/env/private';
import { celebrationLines, celebrationOn } from '#lib/celebrations.js';
import { localDateISO } from '#lib/date.js';
import { MAX_LEAD_DAYS, parseLeadDays } from '#lib/reminderLeadTimes.js';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { isMailEnabled, sendMail } from '#lib/server/mail/index.js';
import {
	buildCelebrationEmail,
	buildReminderEmail,
	buildReminderUpcomingEmail,
	buildShiftEmail,
	formatWhen,
	reminderUpcomingSubject
} from '#lib/server/mail/templates.js';
import { buildCelebrationRows } from './celebrations';
import { deliverIncident, deliverIncidentNtfy } from './incidents';
import { publicLink } from './links';
import { isNtfyEnabled, sendNtfy } from './ntfy';
import { buildReminderHeadsUpRows } from './reminder-heads-up';
import {
	CATCH_UP_MS,
	claimNext,
	cleanupOldRows,
	enqueue,
	markFailedOrRequeue,
	markSent,
	markSkipped,
	recoverOrphanedClaims,
	reminderDedupeKey,
	shiftDedupeKey,
	type ClaimedNotification,
	type EnqueueRow,
	type Recipient
} from './outbox';

// Overridable for tests (NOTIFY_SCAN_INTERVAL_MS=1000); floor prevents a
// misconfigured prod value from busy-looping the scheduler.
const SCAN_INTERVAL_MS = (() => {
	const raw = Number(env.NOTIFY_SCAN_INTERVAL_MS);
	return Number.isFinite(raw) && raw >= 250 ? raw : 60 * 1000;
})();
// Shift alerts fire when a boundary (start or end) enters this window.
const SHIFT_LEAD_MS = 24 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;
let scanning = false;

/**
 * Users relevant to a notification category: active, with the category's
 * email flag and their ntfy topic. Channel filtering happens at the call
 * site: email rows need flag && email, ntfy rows need a topic.
 */
async function categoryRecipients(
	flagColumn:
		| typeof schema.users.notifyReminderEmail
		| typeof schema.users.notifyShiftEmail
		| typeof schema.users.notifyCelebrationEmail
): Promise<Recipient[]> {
	return db
		.select({
			id: schema.users.id,
			role: schema.users.role,
			email: schema.users.email,
			ntfyTopic: schema.users.ntfyTopic,
			flag: flagColumn
		})
		.from(schema.users)
		.where(eq(schema.users.isActive, true));
}

/**
 * `companionId:userId` for every caretaker assignment. Caretakers are eligible
 * for reminder notifications only for companions they are assigned to. Shift
 * status is deliberately ignored: assigned means notified (product call: a
 * reminder due off-shift is still that caretaker's companion).
 */
async function caretakerAssignments(): Promise<Set<string>> {
	const assignments = await db.query.companionCaretakers.findMany();
	return new Set(assignments.map((a) => `${a.companionId}:${a.userId}`));
}

/** Due reminders → one outbox row per eligible recipient. */
async function produceReminders(now: Date): Promise<EnqueueRow[]> {
	const due = await db
		.select({
			id: schema.reminders.id,
			dueAt: schema.reminders.dueAt,
			companionId: schema.reminders.companionId
		})
		.from(schema.reminders)
		.innerJoin(schema.companions, eq(schema.reminders.companionId, schema.companions.id))
		.where(
			and(
				isNull(schema.reminders.completedAt),
				lte(schema.reminders.dueAt, now),
				gt(schema.reminders.dueAt, new Date(now.getTime() - CATCH_UP_MS)),
				eq(schema.companions.isActive, true)
			)
		);
	if (due.length === 0) return [];

	const recipients = await categoryRecipients(schema.users.notifyReminderEmail);
	const assigned = await caretakerAssignments();

	const mailOn = isMailEnabled();
	const ntfyOn = isNtfyEnabled();
	const rows: EnqueueRow[] = [];
	for (const reminder of due) {
		for (const user of recipients) {
			// Same visibility scope for every channel: caretakers only for
			// companions assigned to them. Shift status is deliberately ignored.
			if (user.role === 'caretaker' && !assigned.has(`${reminder.companionId}:${user.id}`)) {
				continue;
			}
			const payload = {
				kind: 'reminderDue' as const,
				reminderId: reminder.id,
				dueAtEpoch: Math.floor(reminder.dueAt.getTime() / 1000)
			};
			if (mailOn && user.flag && user.email) {
				rows.push({
					dedupeKey: reminderDedupeKey(reminder.id, reminder.dueAt, user.id, 'email'),
					userId: user.id,
					channel: 'email',
					payload
				});
			}
			if (ntfyOn && user.ntfyTopic) {
				rows.push({
					dedupeKey: reminderDedupeKey(reminder.id, reminder.dueAt, user.id, 'ntfy'),
					userId: user.id,
					channel: 'ntfy',
					payload
				});
			}
		}
	}
	return rows;
}

/**
 * Reminders with lead times whose shortest eligible heads-up has come (see
 * pickHeadsUp) → one outbox row per eligible recipient, same recipients as
 * the due notification. The due_at bound keeps the scan to reminders a lead
 * could reach (plus a day of slack for DST).
 */
async function produceReminderHeadsUps(now: Date): Promise<EnqueueRow[]> {
	const horizon = new Date(now.getTime() + (MAX_LEAD_DAYS + 1) * 24 * 60 * 60 * 1000);
	const candidates = await db
		.select({
			id: schema.reminders.id,
			companionId: schema.reminders.companionId,
			dueAt: schema.reminders.dueAt,
			notifyLeadDays: schema.reminders.notifyLeadDays,
			leadArmedAt: schema.reminders.leadArmedAt,
			createdAt: schema.reminders.createdAt
		})
		.from(schema.reminders)
		.innerJoin(schema.companions, eq(schema.reminders.companionId, schema.companions.id))
		.where(
			and(
				isNull(schema.reminders.completedAt),
				isNotNull(schema.reminders.notifyLeadDays),
				gt(schema.reminders.dueAt, now),
				lte(schema.reminders.dueAt, horizon),
				eq(schema.companions.isActive, true)
			)
		);
	if (candidates.length === 0) return [];
	const recipients = await categoryRecipients(schema.users.notifyReminderEmail);
	return buildReminderHeadsUpRows(candidates, recipients, await caretakerAssignments(), now, {
		mailOn: isMailEnabled(),
		ntfyOn: isNtfyEnabled()
	});
}

/**
 * Shifts whose start or end falls within the next 24h → one outbox row per
 * recipient per boundary. Recipients: opted-in admins/members plus the
 * shift's own caretaker (their shift, their alert). Other caretakers never.
 * Windows are future-only (boundary > now), so a boundary that slipped past
 * while the app was down simply never alerts — no stale notifications.
 */
async function produceShifts(now: Date): Promise<EnqueueRow[]> {
	const horizon = new Date(now.getTime() + SHIFT_LEAD_MS);
	const upcoming = await db
		.select({
			id: schema.caretakerShifts.id,
			userId: schema.caretakerShifts.userId,
			startAt: schema.caretakerShifts.startAt,
			endAt: schema.caretakerShifts.endAt
		})
		.from(schema.caretakerShifts)
		.where(
			and(gt(schema.caretakerShifts.endAt, now), lte(schema.caretakerShifts.startAt, horizon))
		);
	if (upcoming.length === 0) return [];

	const recipients = await categoryRecipients(schema.users.notifyShiftEmail);

	const mailOn = isMailEnabled();
	const ntfyOn = isNtfyEnabled();
	const rows: EnqueueRow[] = [];
	for (const shift of upcoming) {
		const boundaries: Array<{ kind: 'shiftStart' | 'shiftEnd'; at: Date }> = [
			{ kind: 'shiftStart', at: shift.startAt },
			{ kind: 'shiftEnd', at: shift.endAt }
		];
		for (const b of boundaries) {
			if (b.at <= now || b.at > horizon) continue;
			for (const user of recipients) {
				// Admins/members always; among caretakers only the shift owner.
				if (user.role === 'caretaker' && user.id !== shift.userId) continue;
				const payload = {
					kind: b.kind,
					shiftId: shift.id,
					boundaryEpoch: Math.floor(b.at.getTime() / 1000)
				};
				if (mailOn && user.flag && user.email) {
					rows.push({
						dedupeKey: shiftDedupeKey(shift.id, b.kind, b.at, user.id, 'email'),
						userId: user.id,
						channel: 'email',
						payload
					});
				}
				if (ntfyOn && user.ntfyTopic) {
					rows.push({
						dedupeKey: shiftDedupeKey(shift.id, b.kind, b.at, user.id, 'ntfy'),
						userId: user.id,
						channel: 'ntfy',
						payload
					});
				}
			}
		}
	}
	return rows;
}

/**
 * Today's birthdays (exact dobs only) and homecoming anniversaries, from
 * 09:00 household time. Admins and members only; caretakers are dropped in
 * buildCelebrationRows and again at delivery.
 */
export async function produceCelebrations(now: Date): Promise<EnqueueRow[]> {
	const companions = await db
		.select({
			id: schema.companions.id,
			dob: schema.companions.dob,
			dobApproximate: schema.companions.dobApproximate,
			homecomingDate: schema.companions.homecomingDate,
			isActive: schema.companions.isActive
		})
		.from(schema.companions)
		.where(eq(schema.companions.isActive, true));
	if (companions.length === 0) return [];
	const recipients = await categoryRecipients(schema.users.notifyCelebrationEmail);
	return buildCelebrationRows(companions, recipients, now, {
		mailOn: isMailEnabled(),
		ntfyOn: isNtfyEnabled()
	});
}

async function produce(): Promise<void> {
	const now = new Date();
	const rows = [
		...(await produceReminders(now)),
		...(await produceReminderHeadsUps(now)),
		...(await produceShifts(now)),
		...(await produceCelebrations(now))
	];
	const fresh = await enqueue(rows);
	if (fresh > 0) console.info(`[notify] enqueued ${fresh} notification(s)`);
}

/** Resolve the recipient, or null if no longer eligible at delivery time. */
async function eligibleRecipient(userId: string) {
	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, userId),
		columns: { passwordHash: false }
	});
	if (!user || !user.isActive) return null;
	return user;
}

async function deliverReminder(
	row: ClaimedNotification,
	payload: { reminderId: string; dueAtEpoch: number }
): Promise<void> {
	const reminder = await db.query.reminders.findFirst({
		where: eq(schema.reminders.id, payload.reminderId)
	});
	// Reminder deleted or completed since enqueue: nothing to say anymore.
	if (!reminder || reminder.completedAt) {
		await markSkipped(row.id);
		return;
	}
	// The row was created for a specific occurrence time. If the reminder was
	// rescheduled since, this row is moot — the producer creates a fresh row
	// (new dedupe key) when the new time comes due.
	if (Math.floor(reminder.dueAt.getTime() / 1000) !== payload.dueAtEpoch) {
		await markSkipped(row.id);
		return;
	}
	const user = await eligibleRecipient(row.userId);
	if (!user || !user.email || !user.notifyReminderEmail) {
		await markSkipped(row.id);
		return;
	}
	if (user.role === 'caretaker') {
		const stillAssigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, reminder.companionId),
				eq(schema.companionCaretakers.userId, user.id)
			)
		});
		if (!stillAssigned) {
			await markSkipped(row.id);
			return;
		}
	}
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, reminder.companionId)
	});
	if (!companion || !companion.isActive) {
		await markSkipped(row.id);
		return;
	}

	const link = publicLink(`/${companion.id}/reminders`);
	const message = buildReminderEmail(
		user.locale,
		{ displayName: user.displayName, email: user.email },
		{ title: reminder.title, description: reminder.description, dueAt: reminder.dueAt },
		companion.name,
		link
	);
	await sendMail(message);
	await markSent(row.id);
}

type ReminderUpcomingPayload = { reminderId: string; dueAtEpoch: number; leadDays: number };

/**
 * Delivery re-check for a heads-up row: the reminder is still open, still due
 * at the row's occurrence time, still carries the row's lead and is not yet
 * due; the recipient is active, still has the row's channel and, as a
 * caretaker, is still assigned; the companion is active. Returns what to
 * render and where to send it, or null to skip.
 */
export async function reminderUpcomingContext(
	row: Pick<ClaimedNotification, 'userId' | 'channel'>,
	payload: ReminderUpcomingPayload,
	now: Date
) {
	const reminder = await db.query.reminders.findFirst({
		where: eq(schema.reminders.id, payload.reminderId)
	});
	if (!reminder || reminder.completedAt) return null;
	if (Math.floor(reminder.dueAt.getTime() / 1000) !== payload.dueAtEpoch) return null;
	if (!parseLeadDays(reminder.notifyLeadDays).includes(payload.leadDays)) return null;
	if (reminder.dueAt <= now) return null;
	const user = await eligibleRecipient(row.userId);
	if (!user) return null;
	let address: string | null = null;
	if (row.channel === 'email') address = user.notifyReminderEmail ? user.email : null;
	else if (row.channel === 'ntfy') address = user.ntfyTopic;
	if (!address) return null;
	if (user.role === 'caretaker') {
		const stillAssigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, reminder.companionId),
				eq(schema.companionCaretakers.userId, user.id)
			)
		});
		if (!stillAssigned) return null;
	}
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, reminder.companionId)
	});
	if (!companion || !companion.isActive) return null;
	return { reminder, companion, user, address };
}

export async function deliverReminderUpcoming(
	row: ClaimedNotification,
	payload: ReminderUpcomingPayload
): Promise<void> {
	const now = new Date();
	const ctx = await reminderUpcomingContext(row, payload, now);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { reminder, companion, user, address } = ctx;
	const message = buildReminderUpcomingEmail(
		user.locale,
		{ displayName: user.displayName, email: address },
		{ title: reminder.title, description: reminder.description, dueAt: reminder.dueAt },
		companion.name,
		publicLink(`/${companion.id}/reminders`),
		now
	);
	await sendMail(message);
	await markSent(row.id);
}

export async function deliverReminderUpcomingNtfy(
	row: ClaimedNotification,
	payload: ReminderUpcomingPayload
): Promise<void> {
	const now = new Date();
	const ctx = await reminderUpcomingContext(row, payload, now);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { reminder, companion, user, address } = ctx;
	await sendNtfy(address, {
		title: reminderUpcomingSubject(user.locale, reminder.title, reminder.dueAt, now),
		message: `${t(user.locale, 'email.reminderUpcoming.body', { companion: companion.name, title: reminder.title })}\n${t(user.locale, 'email.reminderUpcoming.dueLine', { due: formatWhen(user.locale, reminder.dueAt) })}`,
		click: publicLink(`/${companion.id}/reminders`)
	});
	await markSent(row.id);
}

async function deliverShift(
	row: ClaimedNotification,
	payload: { kind: 'shiftStart' | 'shiftEnd'; shiftId: string; boundaryEpoch: number }
): Promise<void> {
	const shift = await db.query.caretakerShifts.findFirst({
		where: eq(schema.caretakerShifts.id, payload.shiftId)
	});
	if (!shift) {
		await markSkipped(row.id);
		return;
	}
	const boundary = payload.kind === 'shiftStart' ? shift.startAt : shift.endAt;
	// The row was created for a specific boundary time. If the shift has been
	// rescheduled since, this row is moot — the producer creates a fresh row
	// (new dedupe key) when the new time enters the window.
	if (Math.floor(boundary.getTime() / 1000) !== payload.boundaryEpoch) {
		await markSkipped(row.id);
		return;
	}
	// Boundary already passed: alert is stale, drop it silently.
	if (boundary.getTime() <= Date.now()) {
		await markSkipped(row.id);
		return;
	}
	const user = await eligibleRecipient(row.userId);
	if (!user || !user.email || !user.notifyShiftEmail) {
		await markSkipped(row.id);
		return;
	}
	// Symmetry with deliverReminder's assignment re-check: a user demoted to
	// caretaker after enqueue must not receive another caretaker's shift alert.
	if (user.role === 'caretaker' && user.id !== shift.userId) {
		await markSkipped(row.id);
		return;
	}
	const caretaker = await db.query.users.findFirst({
		where: eq(schema.users.id, shift.userId),
		columns: { displayName: true }
	});
	if (!caretaker) {
		await markSkipped(row.id);
		return;
	}

	// Caretaker lands on their dashboard; admins/members on home (they cannot
	// open /care).
	const link = publicLink(user.role === 'caretaker' ? '/care' : '/');
	const message = buildShiftEmail(
		user.locale,
		{ displayName: user.displayName, email: user.email },
		payload.kind,
		caretaker.displayName,
		{ startAt: shift.startAt, endAt: shift.endAt },
		link
	);
	await sendMail(message);
	await markSent(row.id);
}

async function deliverReminderNtfy(
	row: ClaimedNotification,
	payload: { reminderId: string; dueAtEpoch: number }
): Promise<void> {
	const reminder = await db.query.reminders.findFirst({
		where: eq(schema.reminders.id, payload.reminderId)
	});
	if (!reminder || reminder.completedAt) {
		await markSkipped(row.id);
		return;
	}
	if (Math.floor(reminder.dueAt.getTime() / 1000) !== payload.dueAtEpoch) {
		await markSkipped(row.id);
		return;
	}
	const user = await eligibleRecipient(row.userId);
	if (!user || !user.ntfyTopic) {
		await markSkipped(row.id);
		return;
	}
	if (user.role === 'caretaker') {
		const stillAssigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, reminder.companionId),
				eq(schema.companionCaretakers.userId, user.id)
			)
		});
		if (!stillAssigned) {
			await markSkipped(row.id);
			return;
		}
	}
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, reminder.companionId)
	});
	if (!companion || !companion.isActive) {
		await markSkipped(row.id);
		return;
	}

	await sendNtfy(user.ntfyTopic, {
		title: t(user.locale, 'email.reminder.subject', { title: reminder.title }),
		message: `${t(user.locale, 'email.reminder.body', { companion: companion.name, title: reminder.title })}\n${t(user.locale, 'email.reminder.dueLine', { due: formatWhen(user.locale, reminder.dueAt) })}`,
		click: publicLink(`/${companion.id}/reminders`)
	});
	await markSent(row.id);
}

async function deliverShiftNtfy(
	row: ClaimedNotification,
	payload: { kind: 'shiftStart' | 'shiftEnd'; shiftId: string; boundaryEpoch: number }
): Promise<void> {
	const shift = await db.query.caretakerShifts.findFirst({
		where: eq(schema.caretakerShifts.id, payload.shiftId)
	});
	if (!shift) {
		await markSkipped(row.id);
		return;
	}
	const boundary = payload.kind === 'shiftStart' ? shift.startAt : shift.endAt;
	if (Math.floor(boundary.getTime() / 1000) !== payload.boundaryEpoch) {
		await markSkipped(row.id);
		return;
	}
	if (boundary.getTime() <= Date.now()) {
		await markSkipped(row.id);
		return;
	}
	const user = await eligibleRecipient(row.userId);
	if (!user || !user.ntfyTopic) {
		await markSkipped(row.id);
		return;
	}
	if (user.role === 'caretaker' && user.id !== shift.userId) {
		await markSkipped(row.id);
		return;
	}
	const caretaker = await db.query.users.findFirst({
		where: eq(schema.users.id, shift.userId),
		columns: { displayName: true }
	});
	if (!caretaker) {
		await markSkipped(row.id);
		return;
	}

	const subjectKey =
		payload.kind === 'shiftStart' ? 'email.shift.startSubject' : 'email.shift.endSubject';
	const bodyKey = payload.kind === 'shiftStart' ? 'email.shift.startBody' : 'email.shift.endBody';
	const bodyParams: Record<string, string> =
		payload.kind === 'shiftStart'
			? { caretaker: caretaker.displayName, start: formatWhen(user.locale, shift.startAt) }
			: { caretaker: caretaker.displayName, end: formatWhen(user.locale, shift.endAt) };
	await sendNtfy(user.ntfyTopic, {
		title: t(user.locale, subjectKey, { caretaker: caretaker.displayName }),
		message: t(user.locale, bodyKey, bodyParams),
		click: publicLink(user.role === 'caretaker' ? '/care' : '/')
	});
	await markSent(row.id);
}

/**
 * Delivery re-check for a celebration row: the row's date is still today (no
 * catch-up into the next day), the companion is still active and still
 * celebrates on that date, the recipient is still an active admin or member,
 * and they still have the row's channel (email opt-in and address, or an
 * ntfy topic). Returns what to render and where to send it, or null to skip.
 */
export async function celebrationContext(
	row: Pick<ClaimedNotification, 'userId' | 'channel'>,
	payload: { companionId: string; date: string }
) {
	if (payload.date !== localDateISO()) return null;
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, payload.companionId)
	});
	if (!companion || !companion.isActive) return null;
	const celebration = celebrationOn(companion, payload.date);
	if (!celebration) return null;
	const user = await eligibleRecipient(row.userId);
	if (!user || user.role === 'caretaker') return null;
	let address: string | null = null;
	if (row.channel === 'email') address = user.notifyCelebrationEmail ? user.email : null;
	else if (row.channel === 'ntfy') address = user.ntfyTopic;
	if (!address) return null;
	return { companion, celebration, user, address };
}

async function deliverCelebration(
	row: ClaimedNotification,
	payload: { companionId: string; date: string }
): Promise<void> {
	const ctx = await celebrationContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { companion, celebration, user, address } = ctx;
	const message = buildCelebrationEmail(
		user.locale,
		{ displayName: user.displayName, email: address },
		companion.name,
		celebration,
		publicLink(`/${companion.id}`)
	);
	await sendMail(message);
	await markSent(row.id);
}

async function deliverCelebrationNtfy(
	row: ClaimedNotification,
	payload: { companionId: string; date: string }
): Promise<void> {
	const ctx = await celebrationContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { companion, celebration, user, address } = ctx;
	await sendNtfy(address, {
		title: t(user.locale, 'email.celebration.subject', { name: companion.name }),
		message: celebrationLines(user.locale, companion.name, celebration).join('\n'),
		click: publicLink(`/${companion.id}`)
	});
	await markSent(row.id);
}

/** A kind this build has no deliverer for: skip it rather than strand a claimed row. */
async function skipUnknownKind(row: ClaimedNotification): Promise<void> {
	const kind = (row.payload as { kind?: unknown }).kind;
	console.error(
		`[notify] no deliverer for kind '${String(kind)}' on channel '${row.channel}'; skipping row ${row.id}`
	);
	await markSkipped(row.id);
}

/** Drain the queue until empty. Per-row errors requeue/fail that row only. */
export async function drain(): Promise<void> {
	// One attempt per row per pass: rows requeued after a failure are excluded
	// until the next scan, so the 60s tick acts as retry backoff instead of
	// burning every attempt back-to-back against a struggling SMTP server.
	const failedThisPass = new Set<string>();
	for (;;) {
		const row = await claimNext(failedThisPass);
		if (!row) return;
		try {
			if (row.channel === 'email') {
				if (row.payload.kind === 'reminderDue') {
					await deliverReminder(row, row.payload);
				} else if (row.payload.kind === 'reminderUpcoming') {
					await deliverReminderUpcoming(row, row.payload);
				} else if (row.payload.kind === 'celebration') {
					await deliverCelebration(row, row.payload);
				} else if (row.payload.kind === 'shiftStart' || row.payload.kind === 'shiftEnd') {
					await deliverShift(row, row.payload);
				} else if (
					row.payload.kind === 'incidentLogged' ||
					row.payload.kind === 'incidentUpdated'
				) {
					await deliverIncident(row, row.payload);
				} else {
					await skipUnknownKind(row);
				}
			} else if (row.channel === 'ntfy') {
				if (row.payload.kind === 'reminderDue') {
					await deliverReminderNtfy(row, row.payload);
				} else if (row.payload.kind === 'reminderUpcoming') {
					await deliverReminderUpcomingNtfy(row, row.payload);
				} else if (row.payload.kind === 'celebration') {
					await deliverCelebrationNtfy(row, row.payload);
				} else if (row.payload.kind === 'shiftStart' || row.payload.kind === 'shiftEnd') {
					await deliverShiftNtfy(row, row.payload);
				} else if (
					row.payload.kind === 'incidentLogged' ||
					row.payload.kind === 'incidentUpdated'
				) {
					await deliverIncidentNtfy(row, row.payload);
				} else {
					await skipUnknownKind(row);
				}
			} else {
				// apprise lands in a later PR.
				console.error(`[notify] no deliverer for channel '${row.channel}'; skipping row ${row.id}`);
				await markSkipped(row.id);
			}
		} catch (err) {
			console.error(`[notify] delivery failed (attempt ${row.attempts}):`, err);
			failedThisPass.add(row.id);
			await markFailedOrRequeue(row);
		}
	}
}

async function scan(): Promise<void> {
	if (scanning) return;
	scanning = true;
	try {
		await produce();
		await drain();
		await cleanupOldRows();
	} catch (err) {
		console.error('[notify] scan failed:', err);
	} finally {
		scanning = false;
	}
}

/**
 * Boot entry point. No-op unless SMTP or ntfy is configured. Recovers rows
 * orphaned by a crash, runs one immediate scan, then ticks every minute. The
 * timer is unref'd so it never keeps the process alive.
 */
export function startNotifyScheduler(): void {
	if (!isMailEnabled() && !isNtfyEnabled()) return;
	if (timer) return;
	recoverOrphanedClaims()
		.then((n) => {
			if (n > 0) console.info(`[notify] recovered ${n} interrupted notification(s)`);
			return scan();
		})
		.catch((err) => console.error('[notify] scheduler start failed:', err));
	timer = setInterval(() => void scan(), SCAN_INTERVAL_MS);
	timer.unref();
	console.info(
		`[notify] notification scheduler started (${SCAN_INTERVAL_MS}ms interval, channels: ${[
			...(isMailEnabled() ? ['email'] : []),
			...(isNtfyEnabled() ? ['ntfy'] : [])
		].join('+')})`
	);
}
