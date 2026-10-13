// Client-safe shapes for a journal day's health records. Built server-side by
// $lib/server/journal-day-items; rendered by DayItemChip and DayHealthRecords.
// Display fields only: no storage keys, providers or upload bookkeeping.
import type { HealthEventType } from '$lib/health';
import type { DocumentCategory, WeightUnit } from '$lib/activityTypes';

export type DayItemDocument = {
	id: string;
	date: string; // YYYY-MM-DD: documentDate, or the local upload date when unset
	title: string;
	category: DocumentCategory;
	mimeType: string;
	filename: string; // for /api/documents/{companionId}/{filename}
};

export type DayItem =
	| {
			kind: 'health';
			id: string;
			at: string; // occurredAt as ISO 8601 (survives res.json() on Load more)
			type: HealthEventType;
			title: string;
			documents: DayItemDocument[]; // every document attached to this event
	  }
	| { kind: 'weight'; id: string; at: string; weight: number; unit: WeightUnit }
	| ({ kind: 'document'; eventTitle: string | null } & DayItemDocument);

export function documentUrl(companionId: string, filename: string): string {
	return `/api/documents/${companionId}/${filename}`;
}
