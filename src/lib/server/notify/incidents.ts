// Owner alerts for caretaker incident activity (issue #282). A caretaker's
// create or update enqueues one row per channel per active admin/member
// (minus the actor); delivery renders the message from current data and
// skips anything that no longer applies.
import { and, eq, inArray } from 'drizzle-orm';
import { currentSeverity, incidentPath, type Severity } from '#lib/incidents.js';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { isMailEnabled, sendMail } from '#lib/server/mail/index.js';
import { buildIncidentEmail, incidentAlertLines } from '#lib/server/mail/templates.js';
import { publicLink } from './links';
import { isNtfyEnabled, sendNtfy } from './ntfy';
import {
	enqueue,
	incidentDedupeKey,
	markSent,
	markSkipped,
	type ClaimedNotification,
	type EnqueueRow
} from './outbox';

export { incidentDedupeKey };

export type IncidentPayload =
	| { kind: 'incidentLogged'; incidentId: string }
	| { kind: 'incidentUpdated'; incidentId: string; updateId: string };

/**
 * Enqueue the alert for a caretaker's incident write. Call only after the
 * write succeeded and only for caretaker actors. Returns how many rows were new.
 */
export async function enqueueIncidentAlert(
	event: IncidentPayload,
	actorId: string
): Promise<number> {
	const mailOn = isMailEnabled();
	const ntfyOn = isNtfyEnabled();
	if (!mailOn && !ntfyOn) return 0;
	const users = await db
		.select({
			id: schema.users.id,
			email: schema.users.email,
			ntfyTopic: schema.users.ntfyTopic,
			notifyIncidentEmail: schema.users.notifyIncidentEmail
		})
		.from(schema.users)
		.where(and(eq(schema.users.isActive, true), inArray(schema.users.role, ['admin', 'member'])));
	const kind = event.kind === 'incidentLogged' ? 'logged' : 'updated';
	const keyId = event.kind === 'incidentLogged' ? event.incidentId : event.updateId;
	const rows: EnqueueRow[] = [];
	for (const user of users) {
		if (user.id === actorId) continue;
		if (mailOn && user.notifyIncidentEmail && user.email) {
			rows.push({
				dedupeKey: incidentDedupeKey(kind, keyId, user.id, 'email'),
				userId: user.id,
				channel: 'email',
				payload: event
			});
		}
		if (ntfyOn && user.ntfyTopic) {
			rows.push({
				dedupeKey: incidentDedupeKey(kind, keyId, user.id, 'ntfy'),
				userId: user.id,
				channel: 'ntfy',
				payload: event
			});
		}
	}
	return enqueue(rows);
}

/**
 * Delivery re-check: the incident (and update) still exist, the companion is
 * active, the recipient is an active admin or member and still has the row's
 * channel. Returns what to render and where to send it, or null to skip.
 */
export async function incidentContext(
	row: Pick<ClaimedNotification, 'userId' | 'channel'>,
	payload: IncidentPayload
) {
	const incident = await db.query.healthEvents.findFirst({
		where: and(
			eq(schema.healthEvents.id, payload.incidentId),
			eq(schema.healthEvents.type, 'incident')
		)
	});
	if (!incident) return null;
	let update: typeof schema.healthEventUpdates.$inferSelect | null = null;
	if (payload.kind === 'incidentUpdated') {
		update =
			(await db.query.healthEventUpdates.findFirst({
				where: and(
					eq(schema.healthEventUpdates.id, payload.updateId),
					eq(schema.healthEventUpdates.healthEventId, incident.id)
				)
			})) ?? null;
		if (!update) return null;
	}
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, incident.companionId)
	});
	if (!companion || !companion.isActive) return null;
	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, row.userId),
		columns: { passwordHash: false }
	});
	if (!user || !user.isActive || user.role === 'caretaker') return null;
	let address: string | null = null;
	if (row.channel === 'email') address = user.notifyIncidentEmail ? user.email : null;
	else if (row.channel === 'ntfy') address = user.ntfyTopic;
	if (!address) return null;
	const updates = await db.query.healthEventUpdates.findMany({
		where: eq(schema.healthEventUpdates.healthEventId, incident.id),
		columns: { severity: true, occurredAt: true }
	});
	const severity: Severity | null = currentSeverity(incident, updates);
	return { incident, update, companion, user, address, severity };
}

export async function deliverIncident(
	row: ClaimedNotification,
	payload: IncidentPayload
): Promise<void> {
	const ctx = await incidentContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { incident, update, companion, user, address, severity } = ctx;
	const message = buildIncidentEmail(
		user.locale,
		{ displayName: user.displayName, email: address },
		{
			kind: payload.kind,
			companionName: companion.name,
			title: incident.title,
			severity,
			text: update ? update.body : incident.notes
		},
		publicLink(incidentPath(companion.id, incident.id))
	);
	await sendMail(message);
	await markSent(row.id);
}

/** Title and severity only: ntfy topics may sit on a public server. */
export async function deliverIncidentNtfy(
	row: ClaimedNotification,
	payload: IncidentPayload
): Promise<void> {
	const ctx = await incidentContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { incident, companion, user, address, severity } = ctx;
	const params = { name: companion.name, title: incident.title };
	await sendNtfy(address, {
		title: t(
			user.locale,
			payload.kind === 'incidentLogged'
				? 'email.incident.loggedSubject'
				: 'email.incident.updatedSubject',
			params
		),
		message: incidentAlertLines(
			user.locale,
			payload.kind,
			companion.name,
			incident.title,
			severity
		).join('\n'),
		click: publicLink(incidentPath(companion.id, incident.id))
	});
	await markSent(row.id);
}
