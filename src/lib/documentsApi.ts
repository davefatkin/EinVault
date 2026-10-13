// Client calls to the documents API for the documents page and the journal
// day. Each returns a result instead of throwing, so a caller can try every
// file and report each failure by name.
import { t, type Locale } from '$lib/i18n';
import { failureMessage } from '$lib/mediaApi';

/** File types the documents endpoint accepts; the server re-checks the bytes. */
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic';

export type DocResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

export type CreatedDocument = { id: string; title: string; documentDate: string | null };

async function send(
	url: string,
	init: NonNullable<Parameters<typeof fetch>[1]>,
	fallback: string
): Promise<DocResult<unknown>> {
	let res: Response;
	try {
		res = await fetch(url, init);
	} catch {
		return { ok: false, message: fallback };
	}
	if (!res.ok) return { ok: false, message: await failureMessage(res, fallback) };
	return { ok: true, value: await res.json().catch(() => null) };
}

function toCreated(r: DocResult<unknown>, fallback: string): DocResult<CreatedDocument> {
	if (!r.ok) return r;
	const d = r.value as Partial<CreatedDocument> | null;
	if (!d || typeof d !== 'object' || typeof d.id !== 'string' || typeof d.title !== 'string') {
		return { ok: false, message: fallback };
	}
	return { ok: true, value: { id: d.id, title: d.title, documentDate: d.documentDate ?? null } };
}

export async function uploadDocument(
	companionId: string,
	file: File,
	opts: { healthEventId?: string; documentDate?: string },
	locale: Locale
): Promise<DocResult<CreatedDocument>> {
	const body = new FormData();
	body.set('file', file);
	if (opts.healthEventId) body.set('healthEventId', opts.healthEventId);
	if (opts.documentDate) body.set('documentDate', opts.documentDate);
	const fallback = t(locale, 'page.documents.uploadFailed');
	return toCreated(
		await send(`/api/companions/${companionId}/documents`, { method: 'POST', body }, fallback),
		fallback
	);
}

export async function attachDocument(
	companionId: string,
	documentId: string,
	healthEventId: string,
	locale: Locale
): Promise<DocResult> {
	const r = await send(
		`/api/companions/${companionId}/documents/${documentId}`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ healthEventId })
		},
		t(locale, 'media.actionFailed')
	);
	return r.ok ? { ok: true, value: null } : r;
}

export async function importFromPaperless(
	companionId: string,
	paperlessId: number,
	locale: Locale
): Promise<DocResult<CreatedDocument>> {
	const fallback = t(locale, 'paperless.picker.pickFailed');
	return toCreated(
		await send(
			`/api/companions/${companionId}/documents/from-paperless`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ paperlessId })
			},
			fallback
		),
		fallback
	);
}
