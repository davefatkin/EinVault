import { and, asc, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';
import { getIncident } from '#lib/server/incidents.js';
import type { LinkedEvent } from '#lib/incidents.js';
import type { HealthEventType } from '#lib/health.js';

export type LinkOutcome = 'linked' | 'notFound' | 'invalid';

const L = schema.healthEventLinks;
const H = schema.healthEvents;

export async function linkToIncident(
	companionId: string,
	incidentId: string,
	healthEventId: string
): Promise<LinkOutcome> {
	const rows = await db
		.select({ id: H.id, type: H.type })
		.from(H)
		.where(and(eq(H.companionId, companionId), inArray(H.id, [incidentId, healthEventId])));
	const byId = new Map(rows.map((r) => [r.id, r.type]));
	if (!byId.has(incidentId) || !byId.has(healthEventId)) return 'notFound';
	if (incidentId === healthEventId) return 'invalid';
	if (byId.get(incidentId) !== 'incident' || byId.get(healthEventId) === 'incident') {
		return 'invalid';
	}
	await db.insert(L).values({ incidentId, healthEventId }).onConflictDoNothing();
	return 'linked';
}

export async function unlinkFromIncident(
	companionId: string,
	incidentId: string,
	healthEventId: string
): Promise<boolean> {
	if (!(await getIncident(companionId, incidentId))) return false;
	const rows = await db
		.delete(L)
		.where(and(eq(L.incidentId, incidentId), eq(L.healthEventId, healthEventId)))
		.returning({ id: L.healthEventId });
	return rows.length > 0;
}

export async function listLinkedEvents(
	companionId: string,
	incidentId: string
): Promise<LinkedEvent[]> {
	return db
		.select({
			id: H.id,
			type: H.type,
			title: H.title,
			occurredAt: H.occurredAt,
			vetName: H.vetName,
			vetClinic: H.vetClinic,
			notes: H.notes
		})
		.from(L)
		.innerJoin(H, eq(H.id, L.healthEventId))
		.where(and(eq(L.incidentId, incidentId), eq(H.companionId, companionId)))
		.orderBy(asc(H.occurredAt), asc(H.id));
}

export async function listIncidentsForEvent(
	companionId: string,
	healthEventId: string
): Promise<{ id: string; title: string; resolvedAt: Date | null }[]> {
	return db
		.select({ id: H.id, title: H.title, resolvedAt: H.resolvedAt })
		.from(L)
		.innerJoin(H, eq(H.id, L.incidentId))
		.where(and(eq(L.healthEventId, healthEventId), eq(H.companionId, companionId)))
		.orderBy(desc(H.occurredAt), asc(H.id));
}

// Every link of a companion's events, grouped by event, for the Health Log.
export async function listIncidentLinksByEvent(
	companionId: string
): Promise<Record<string, { id: string; title: string; resolvedAt: Date | null }[]>> {
	const rows = await db
		.select({
			eventId: L.healthEventId,
			id: H.id,
			title: H.title,
			resolvedAt: H.resolvedAt
		})
		.from(L)
		.innerJoin(H, eq(H.id, L.incidentId))
		.where(eq(H.companionId, companionId))
		.orderBy(desc(H.occurredAt), asc(H.id));
	const out: Record<string, { id: string; title: string; resolvedAt: Date | null }[]> = {};
	for (const { eventId, ...inc } of rows) (out[eventId] ??= []).push(inc);
	return out;
}

export async function listLinkCandidates(
	companionId: string,
	incidentId: string
): Promise<{ id: string; type: HealthEventType; title: string; occurredAt: Date }[]> {
	const linked = db.select({ id: L.healthEventId }).from(L).where(eq(L.incidentId, incidentId));
	return db
		.select({ id: H.id, type: H.type, title: H.title, occurredAt: H.occurredAt })
		.from(H)
		.where(and(eq(H.companionId, companionId), ne(H.type, 'incident'), notInArray(H.id, linked)))
		.orderBy(desc(H.occurredAt), asc(H.id));
}

export async function listIncidentCandidates(
	companionId: string,
	healthEventId: string
): Promise<{ id: string; title: string; resolvedAt: Date | null; occurredAt: Date }[]> {
	const linked = db.select({ id: L.incidentId }).from(L).where(eq(L.healthEventId, healthEventId));
	return db
		.select({ id: H.id, title: H.title, resolvedAt: H.resolvedAt, occurredAt: H.occurredAt })
		.from(H)
		.where(and(eq(H.companionId, companionId), eq(H.type, 'incident'), notInArray(H.id, linked)))
		.orderBy(sql`${H.resolvedAt} is not null`, desc(H.occurredAt), asc(H.id));
}
