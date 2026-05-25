import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { getImmichClient, immichKey } from '$lib/server/storage';
import { MAX_DAILY_PHOTOS } from '$lib/server/env';
import { isValidDate } from '$lib/server/validation';

const ALLOWED_MIME_PREFIXES = ['image/'];
const ASSET_ID_RE = /^[a-zA-Z0-9-]+$/;

function extFromMime(mime: string, originalFileName: string): string {
	const fromName = originalFileName.split('.').pop()?.toLowerCase();
	if (fromName && /^[a-z0-9]{1,5}$/.test(fromName)) return fromName;
	if (mime === 'image/jpeg') return 'jpg';
	if (mime === 'image/png') return 'png';
	if (mime === 'image/webp') return 'webp';
	if (mime === 'image/gif') return 'gif';
	if (mime === 'image/heic') return 'heic';
	return 'bin';
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') error(403, t(locals.locale, 'error.forbidden'));

	const client = getImmichClient();
	if (!client) error(404, t(locals.locale, 'error.notFound'));

	const { companionId, date } = params;
	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	const body = (await request.json().catch(() => null)) as { assetId?: string } | null;
	const assetId = body?.assetId?.trim();
	if (!assetId || !ASSET_ID_RE.test(assetId)) error(400, 'Invalid asset id');

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const asset = await client.getAsset(assetId);
	if (!asset) error(404, t(locals.locale, 'error.notFound'));
	if (!ALLOWED_MIME_PREFIXES.some((p) => asset.originalMimeType.startsWith(p))) {
		error(400, t(locals.locale, 'error.invalidFileType'));
	}

	let entry = await db.query.journalEntries.findFirst({
		where: and(
			eq(schema.journalEntries.companionId, companionId),
			eq(schema.journalEntries.date, date)
		)
	});

	if (!entry) {
		const [created] = await db
			.insert(schema.journalEntries)
			.values({
				id: generateId(15),
				companionId,
				date,
				body: '',
				loggedBy: locals.user?.id ?? null
			})
			.returning();
		entry = created;
	}

	const [{ value: photoCount }] = await db
		.select({ value: count() })
		.from(schema.journalPhotos)
		.where(eq(schema.journalPhotos.entryId, entry.id));
	if (photoCount >= MAX_DAILY_PHOTOS) {
		error(400, t(locals.locale, 'error.maxPhotosExceeded', { max: MAX_DAILY_PHOTOS }));
	}

	const photoId = generateId(15);
	const ext = extFromMime(asset.originalMimeType, asset.originalFileName);
	const filename = `${photoId}.${ext}`;

	await db.insert(schema.journalPhotos).values({
		id: photoId,
		entryId: entry.id,
		filename,
		provider: 'immich',
		storageKey: immichKey(assetId),
		originalName: asset.originalFileName || null,
		mimeType: asset.originalMimeType,
		sizeBytes: asset.fileSizeInByte ?? 0,
		loggedBy: locals.user.id
	});

	const created = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId),
		with: { logger: { columns: { displayName: true } } }
	});

	return json({
		...created,
		url: `/api/photos/journal/${companionId}/${date}/${filename}`
	});
};
