// Client-safe helpers and view types for incidents (issue #282). Must not
// import #lib/server modules, type-only or otherwise.

import type { UserRef } from '#lib/types.js';
import type { MediaItem } from '#lib/media.js';
import type { HealthEventType } from '#lib/health.js';
import { localDateISO } from '#lib/date.js';

export const SEVERITIES = ['mild', 'moderate', 'severe'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Photo/video cap, counted separately for the overview and for each update. */
export const MAX_INCIDENT_MEDIA = 10;

export function parseSeverity(v: unknown): Severity | null {
	return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v)
		? (v as Severity)
		: null;
}

/** Severity of the latest update (by occurredAt) that has one, else the incident's own. */
export function currentSeverity(
	incident: { severity: Severity | null },
	updates: { severity: Severity | null; occurredAt: Date }[]
): Severity | null {
	let best: { severity: Severity; at: number } | null = null;
	for (const u of updates) {
		if (u.severity === null) continue;
		const at = u.occurredAt.getTime();
		if (!best || at >= best.at) best = { severity: u.severity, at };
	}
	return best?.severity ?? incident.severity ?? null;
}

/** 1 on the start's local day, 2 the next local day, and so on. */
export function incidentDayNumber(startedAt: Date, now: Date = new Date()): number {
	const a = Date.parse(`${localDateISO(startedAt)}T00:00:00Z`);
	const b = Date.parse(`${localDateISO(now)}T00:00:00Z`);
	return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

export function incidentPath(companionId: string, id: string): string {
	return `/${companionId}/health/incidents/${id}`;
}

export function careIncidentPath(companionId: string, id: string): string {
	return `/care/${companionId}/incidents/${id}`;
}

export type OpenIncidentSummary = {
	id: string;
	companionId: string;
	title: string;
	occurredAt: Date;
	currentSeverity: Severity | null;
	lastActivityAt: Date;
	latestUpdate: { body: string; occurredAt: Date } | null;
};

export type LinkedEvent = {
	id: string;
	type: HealthEventType;
	title: string;
	occurredAt: Date;
	vetName: string | null;
	vetClinic: string | null;
	notes: string | null;
};

export type DocRef = { id: string; title: string; filename: string; mimeType: string };

export type UpdateView = {
	id: string;
	body: string;
	severity: Severity | null;
	occurredAt: Date;
	createdAt: Date;
	loggedBy: string | null;
	logger: UserRef;
	media: MediaItem[];
};

export type IncidentView = {
	id: string;
	companionId: string;
	title: string;
	notes: string | null;
	occurredAt: Date;
	severity: Severity | null;
	resolvedAt: Date | null;
	loggedBy: string | null;
	logger: UserRef;
};

export type TimelineItem =
	| { kind: 'update'; update: UpdateView }
	| { kind: 'event'; event: LinkedEvent; documents: DocRef[] }
	| { kind: 'resolved'; at: Date };

export type IncidentDetailData = {
	incident: IncidentView;
	currentSeverity: Severity | null;
	overviewMedia: MediaItem[];
	timeline: TimelineItem[];
	documents: DocRef[];
	journalDates: string[];
};

export type IncidentCaps = {
	canEditOverview: boolean;
	canAddUpdate: boolean;
	canResolve: boolean;
	canLink: boolean;
	/** Upload or import documents onto the incident (owners only). */
	canAttachDocuments: boolean;
	canDelete: boolean;
	canEditUpdate: (u: UpdateView) => boolean;
};

/** Owners may do everything; an archived companion is read-only, and new updates go on open incidents only. */
export function ownerIncidentCaps(opts: { active: boolean; resolved: boolean }): IncidentCaps {
	const { active, resolved } = opts;
	return {
		canEditOverview: active,
		canAddUpdate: active && !resolved,
		canResolve: active,
		canLink: active,
		canAttachDocuments: active,
		canDelete: active,
		canEditUpdate: () => active
	};
}

/**
 * The server is the gate (checkIncidentWrite); this only decides what to
 * offer. On shift a caretaker adds updates and edits their own from today.
 */
export function caretakerIncidentCaps(opts: {
	isOnShift: boolean;
	userId: string;
	today?: string;
}): IncidentCaps {
	const { isOnShift, userId } = opts;
	return {
		canEditOverview: false,
		canAddUpdate: isOnShift,
		canResolve: false,
		canLink: false,
		canAttachDocuments: false,
		canDelete: false,
		canEditUpdate: (u) =>
			isOnShift &&
			u.loggedBy === userId &&
			localDateISO(u.createdAt) === (opts.today ?? localDateISO())
	};
}

export const OWNER_INCIDENT_FORMS = {
	addUpdate: '?/addUpdate',
	editUpdate: '?/editUpdate',
	deleteUpdate: '?/deleteUpdate',
	resolve: '?/resolve',
	reopen: '?/reopen',
	editOverview: '?/editOverview',
	delete: '?/delete',
	link: '?/link',
	unlink: '?/unlink'
};

export const CARETAKER_INCIDENT_FORMS = {
	addUpdate: '?/addUpdate',
	editUpdate: '?/editUpdate',
	deleteUpdate: '?/deleteUpdate'
};
