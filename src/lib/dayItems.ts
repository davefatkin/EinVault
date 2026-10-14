// Client-safe shapes for a journal day's health records. Built server-side by
// $lib/server/journal-day-items; rendered by DayItemChip, DayHealthRecords and HealthDetailModal.
// Display fields only: no storage keys, providers or upload bookkeeping.
import type { HealthEventType } from '$lib/health';
import type { DocumentCategory, WeightUnit } from '$lib/activityTypes';
import type { UserRef } from '$lib/types';

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
			vetName: string | null;
			vetClinic: string | null;
			notes: string | null;
			logger: UserRef;
			linkedHere: boolean; // this day's entry links the event
			fromLink: boolean; // shown on this day only because of a link (its own day is another day)
			journalDates: string[]; // days whose entries link this event, ascending
			documents: DayItemDocument[]; // every document attached to this event
	  }
	| {
			kind: 'weight';
			id: string;
			at: string;
			weight: number;
			unit: WeightUnit;
			notes: string | null;
			logger: UserRef;
	  }
	| ({ kind: 'document'; eventTitle: string | null } & DayItemDocument);

export function documentUrl(companionId: string, filename: string): string {
	return `/api/documents/${companionId}/${filename}`;
}

export type DayRecordItem = Extract<DayItem, { kind: 'health' | 'weight' }>;

/** A document with no health event, offered by the day page's attach list. */
export type AttachableDocument = {
	id: string;
	title: string;
	date: string; // YYYY-MM-DD, same rule as DayItemDocument.date
	category: DocumentCategory;
};

/** The record's detail on the health page, where it can be edited. */
export function healthRecordHref(companionId: string, item: DayRecordItem): string {
	const param = item.kind === 'health' ? 'detailHealth' : 'detailWeight';
	return `/${companionId}/health?${param}=${item.id}`;
}
