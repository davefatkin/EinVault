// Pending document changes for a health event form, applied after the event
// is saved. Client-safe: only talks to the documents API.
import type { Locale } from '#lib/i18n/index.js';
import type { DocumentCategory } from '#lib/activityTypes.js';
import {
	attachDocument,
	importAndAttach,
	unlinkDocument,
	uploadDocument
} from '#lib/documentsApi.js';

export type PaperlessPick = { paperlessId: number; title: string };

export interface PendingAttachments {
	files: File[];
	paperless: PaperlessPick[];
	linkIds: string[];
	unlinkIds: string[];
	category: DocumentCategory;
}

export type AttachFailure = { name: string; message: string };

export function emptyPending(): PendingAttachments {
	return { files: [], paperless: [], linkIds: [], unlinkIds: [], category: 'invoice' };
}

export function addPaperlessPick(p: PendingAttachments, pick: PaperlessPick): PendingAttachments {
	if (p.paperless.some((x) => x.paperlessId === pick.paperlessId)) return p;
	return { ...p, paperless: [...p.paperless, pick] };
}

/** Runs unlinks, links, Paperless picks, then uploads; collects every failure by name. */
export async function applyAttachments(args: {
	companionId: string;
	healthEventId: string;
	day: string;
	pending: PendingAttachments;
	titles: Record<string, string>;
	locale: Locale;
}): Promise<AttachFailure[]> {
	const { companionId, healthEventId, day, pending, titles, locale } = args;
	const failures: AttachFailure[] = [];
	const note = (name: string, r: { ok: boolean; message?: string }) => {
		if (!r.ok) failures.push({ name, message: r.message ?? '' });
	};
	for (const id of pending.unlinkIds) {
		note(titles[id] ?? id, await unlinkDocument(companionId, id, healthEventId, locale));
	}
	for (const id of pending.linkIds) {
		note(titles[id] ?? id, await attachDocument(companionId, id, healthEventId, locale));
	}
	for (const pick of pending.paperless) {
		note(
			pick.title,
			await importAndAttach(companionId, pick.paperlessId, healthEventId, locale, {
				category: pending.category
			})
		);
	}
	for (const file of pending.files) {
		note(
			file.name,
			await uploadDocument(
				companionId,
				file,
				{ healthEventId, documentDate: day, category: pending.category },
				locale
			)
		);
	}
	return failures;
}
