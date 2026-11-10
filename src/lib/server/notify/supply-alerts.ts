// Supply warnings (issue #279): before a supply runs out, when it is low and
// before it expires. Conditions, not one-day windows: a lead is due whenever
// its condition holds, checked from SUPPLY_ALERT_HOUR household time. Each
// lead fires once per stock version (run-out, low stock) or expiry date. The
// dedupe keys stop a repeat while the outbox row exists; the *_alerted markers
// on the supply stop it after outbox cleanup. Admins and members only.
import { and, eq, inArray } from 'drizzle-orm';
import { daysBetweenYmd, localDateISO } from '#lib/date.js';
import { isLowStock, shortestEligibleLead } from '#lib/supplies.js';
import { db, schema } from '#lib/server/db/index.js';
import { isMailEnabled, sendMail } from '#lib/server/mail/index.js';
import {
	buildSupplyAlertEmail,
	supplyAlertLine,
	supplyAlertSubject,
	type SupplyAlert
} from '#lib/server/mail/templates.js';
import { loadSupplyStates, type SupplyState } from '#lib/server/supplies.js';
import { publicLink } from './links';
import { isNtfyEnabled, sendNtfy } from './ntfy';
import {
	enqueue,
	markSent,
	markSkipped,
	supplyDedupeKey,
	type ClaimedNotification,
	type EnqueueRow
} from './outbox';

/** Household-local hour from which supply warnings are enqueued. */
export const SUPPLY_ALERT_HOUR = 9;

export type SupplyAlertPayload = Extract<
	EnqueueRow['payload'],
	{ kind: 'supplyRunOut' | 'supplyLowStock' | 'supplyExpiry' }
>;

/** Splits "{scope}:{lead}" on the last colon. */
function parseMarker(marker: string | null): { scope: string; lead: number } | null {
	if (!marker) return null;
	const at = marker.lastIndexOf(':');
	if (at < 0) return null;
	const lead = Number(marker.slice(at + 1));
	return Number.isInteger(lead) ? { scope: marker.slice(0, at), lead } : null;
}

/** True when this lead (or a shorter one) was already sent for the same scope. */
function alreadySent(marker: string | null, scope: string, lead: number): boolean {
	const sent = parseMarker(marker);
	return !!sent && sent.scope === scope && sent.lead <= lead;
}

function expiryDue(s: SupplyState, today: string): number | null {
	if (!s.expiresOn) return null;
	// A counted supply at 0 is out, not expiring.
	if (s.kind === 'counted' && (s.quantity ?? 0) <= 0) return null;
	return shortestEligibleLead(s.expiryLeads, daysBetweenYmd(today, s.expiresOn));
}

/**
 * Which warnings a supply is due today: the shortest eligible run-out and
 * expiry leads and low stock, minus what its markers say was already sent.
 * Nothing with warnings off.
 */
export function pickSupplyAlerts(
	s: SupplyState,
	today: string
): { runOut?: number; low?: true; expiry?: number } {
	const out: { runOut?: number; low?: true; expiry?: number } = {};
	if (!s.alertsEnabled) return out;
	if (s.daysLeft !== null) {
		const lead = shortestEligibleLead(s.runOutLeads, s.daysLeft);
		if (lead !== null && !alreadySent(s.runOutAlerted, s.stockVersion, lead)) out.runOut = lead;
	}
	if (isLowStock(s.quantity, s.lowStockAt) && s.lowAlerted !== s.stockVersion) out.low = true;
	const expiry = expiryDue(s, today);
	if (expiry !== null && s.expiresOn && !alreadySent(s.expiryAlerted, s.expiresOn, expiry)) {
		out.expiry = expiry;
	}
	return out;
}

/** Active admins and members with their reminder email flag and ntfy topic. */
async function supplyRecipients() {
	return db
		.select({
			id: schema.users.id,
			email: schema.users.email,
			ntfyTopic: schema.users.ntfyTopic,
			notifyReminderEmail: schema.users.notifyReminderEmail
		})
		.from(schema.users)
		.where(and(eq(schema.users.isActive, true), inArray(schema.users.role, ['admin', 'member'])));
}

/**
 * Enqueue today's supply warnings, then mark them on the supply so they never
 * repeat for the same stock version or expiry date. Enqueue comes first: a
 * crash in between re-enqueues next scan, which the dedupe keys turn into a
 * no-op. Nothing before SUPPLY_ALERT_HOUR. Supplies need warnings on and at
 * least one active pet. Email needs mail on, the reminder email flag and an
 * address; ntfy needs ntfy on and a topic. Returns the rows built.
 */
export async function produceSupplyAlerts(now: Date): Promise<EnqueueRow[]> {
	if (now.getHours() < SUPPLY_ALERT_HOUR) return [];
	const mailOn = isMailEnabled();
	const ntfyOn = isNtfyEnabled();
	if (!mailOn && !ntfyOn) return [];
	const today = localDateISO(now);
	const states = await loadSupplyStates({ today, alertsOnly: true, activeOnly: true });
	const due = states
		.map((s) => ({ s, pick: pickSupplyAlerts(s, today) }))
		.filter(({ pick }) => Object.keys(pick).length > 0);
	if (due.length === 0) return [];
	const recipients = await supplyRecipients();

	const rows: EnqueueRow[] = [];
	const marks: { id: string; set: Partial<typeof schema.supplies.$inferInsert> }[] = [];
	for (const { s, pick } of due) {
		const warnings: {
			kind: 'runout' | 'low' | 'expiry';
			scope: string;
			lead: number | null;
			payload: SupplyAlertPayload;
		}[] = [];
		if (pick.runOut !== undefined) {
			warnings.push({
				kind: 'runout',
				scope: s.stockVersion,
				lead: pick.runOut,
				payload: {
					kind: 'supplyRunOut',
					supplyId: s.id,
					stockVersion: s.stockVersion,
					leadDays: pick.runOut
				}
			});
		}
		if (pick.low) {
			warnings.push({
				kind: 'low',
				scope: s.stockVersion,
				lead: null,
				payload: { kind: 'supplyLowStock', supplyId: s.id, stockVersion: s.stockVersion }
			});
		}
		if (pick.expiry !== undefined && s.expiresOn) {
			warnings.push({
				kind: 'expiry',
				scope: s.expiresOn,
				lead: pick.expiry,
				payload: {
					kind: 'supplyExpiry',
					supplyId: s.id,
					expiresOn: s.expiresOn,
					leadDays: pick.expiry
				}
			});
		}

		const set: Partial<typeof schema.supplies.$inferInsert> = {};
		for (const w of warnings) {
			const before = rows.length;
			for (const user of recipients) {
				if (mailOn && user.notifyReminderEmail && user.email) {
					rows.push({
						dedupeKey: supplyDedupeKey(w.kind, s.id, w.scope, w.lead, user.id, 'email'),
						userId: user.id,
						channel: 'email',
						payload: w.payload
					});
				}
				if (ntfyOn && user.ntfyTopic) {
					rows.push({
						dedupeKey: supplyDedupeKey(w.kind, s.id, w.scope, w.lead, user.id, 'ntfy'),
						userId: user.id,
						channel: 'ntfy',
						payload: w.payload
					});
				}
			}
			if (rows.length === before) continue;
			if (w.kind === 'runout') set.runOutAlerted = `${w.scope}:${w.lead}`;
			else if (w.kind === 'low') set.lowAlerted = w.scope;
			else set.expiryAlerted = `${w.scope}:${w.lead}`;
		}
		if (Object.keys(set).length > 0) marks.push({ id: s.id, set });
	}

	const fresh = await enqueue(rows);
	if (fresh > 0) console.info(`[notify] enqueued ${fresh} supply warning(s)`);
	for (const m of marks) {
		await db.update(schema.supplies).set(m.set).where(eq(schema.supplies.id, m.id));
	}
	return rows;
}

/**
 * Delivery re-check: the supply still exists with warnings on and an active
 * pet, its stock version (or expiry date) is unchanged, the row's condition
 * still holds, and the recipient is still an active admin or member with the
 * row's channel. Returns what to render and where to send it, or null to skip.
 */
export async function supplyAlertContext(
	row: Pick<ClaimedNotification, 'userId' | 'channel'>,
	payload: SupplyAlertPayload,
	today: string = localDateISO()
) {
	const [s] = await loadSupplyStates({ supplyId: payload.supplyId, today, alertsOnly: true });
	const active = s?.companions.filter((c) => c.isActive) ?? [];
	if (!s || active.length === 0) return null;

	let alert: SupplyAlert | null = null;
	if (payload.kind === 'supplyRunOut') {
		if (
			s.stockVersion === payload.stockVersion &&
			s.daysLeft !== null &&
			s.runOutOn !== null &&
			s.runOutLeads.includes(payload.leadDays) &&
			s.daysLeft <= payload.leadDays
		) {
			alert = { kind: 'supplyRunOut', daysLeft: s.daysLeft, runOutOn: s.runOutOn };
		}
	} else if (payload.kind === 'supplyLowStock') {
		if (s.stockVersion === payload.stockVersion && isLowStock(s.quantity, s.lowStockAt)) {
			alert = { kind: 'supplyLowStock', quantity: s.quantity ?? 0, unit: s.unit };
		}
	} else {
		const daysToExpiry = daysBetweenYmd(today, payload.expiresOn);
		if (
			s.expiresOn === payload.expiresOn &&
			s.expiryLeads.includes(payload.leadDays) &&
			!(s.kind === 'counted' && (s.quantity ?? 0) <= 0) &&
			daysToExpiry <= payload.leadDays
		) {
			alert = { kind: 'supplyExpiry', expiresOn: payload.expiresOn, expired: daysToExpiry < 0 };
		}
	}
	if (!alert) return null;

	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, row.userId),
		columns: { passwordHash: false }
	});
	if (!user || !user.isActive || user.role === 'caretaker') return null;
	let address: string | null = null;
	if (row.channel === 'email') address = user.notifyReminderEmail ? user.email : null;
	else if (row.channel === 'ntfy') address = user.ntfyTopic;
	if (!address) return null;

	return {
		user,
		address,
		input: { name: s.name, companionNames: active.map((c) => c.name), alert },
		// companions are ordered by name, so this is the first active pet.
		link: publicLink(`/${active[0].id}/supplies/${s.id}`)
	};
}

export async function deliverSupplyAlert(
	row: ClaimedNotification,
	payload: SupplyAlertPayload
): Promise<void> {
	const ctx = await supplyAlertContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { user, address, input, link } = ctx;
	await sendMail(
		buildSupplyAlertEmail(
			user.locale,
			{ displayName: user.displayName, email: address },
			input,
			link
		)
	);
	await markSent(row.id);
}

export async function deliverSupplyAlertNtfy(
	row: ClaimedNotification,
	payload: SupplyAlertPayload
): Promise<void> {
	const ctx = await supplyAlertContext(row, payload);
	if (!ctx) {
		await markSkipped(row.id);
		return;
	}
	const { user, address, input, link } = ctx;
	await sendNtfy(address, {
		title: supplyAlertSubject(user.locale, input),
		message: supplyAlertLine(user.locale, input),
		click: link
	});
	await markSent(row.id);
}
