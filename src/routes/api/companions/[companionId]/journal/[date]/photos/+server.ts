import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, count } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '$env/dynamic/private';
import sharp from 'sharp';
import { DATA_DIR } from '$lib/server/paths';
import { isValidDate } from '$lib/server/validation';

const MAX_PHOTOS_PER_DAY = 5;
const MAX_FILE_SIZE = parseInt(env.UPLOAD_MAX_MB ?? '10') * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const { companionId, date } = params;
	if (!isValidDate(date)) error(400, t(locals.locale, 'error.invalidDate'));

	// Verify companion exists
	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

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

	// Check current photo count for this entry
	const [{ value: photoCount }] = await db
		.select({ value: count() })
		.from(schema.journalPhotos)
		.where(eq(schema.journalPhotos.entryId, entry.id));

	if (photoCount >= MAX_PHOTOS_PER_DAY) {
		error(400, t(locals.locale, 'error.maxPhotosExceeded', { max: String(MAX_PHOTOS_PER_DAY) }));
	}

	const formData = await request.formData();
	const file = formData.get('photo') as File | null;

	if (!file || file.size === 0) error(400, t(locals.locale, 'error.noFileProvided'));
	if (file.size > MAX_FILE_SIZE)
		error(400, t(locals.locale, 'error.fileTooLarge', { max: env.UPLOAD_MAX_MB ?? '10' }));
	if (!ALLOWED_TYPES.includes(file.type)) error(400, t(locals.locale, 'error.invalidFileType'));

	const raw = Buffer.from(await file.arrayBuffer());
	const photoId = generateId(15);
	let processed: Buffer;
	let ext: string;
	let mimeType: string;

	if (file.type === 'image/gif') {
		// Validate GIF magic bytes before passing through
		const sig = raw.slice(0, 6).toString('ascii');
		if (sig !== 'GIF87a' && sig !== 'GIF89a') {
			error(400, t(locals.locale, 'error.invalidGifFile'));
		}
		// Truncate at the GIF terminator byte (0x3B) to strip trailing data
		const termIdx = raw.lastIndexOf(0x3b);
		processed = termIdx !== -1 ? raw.slice(0, termIdx + 1) : raw;
		ext = 'gif';
		mimeType = 'image/gif';
	} else {
		processed = await sharp(raw)
			.resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 85 })
			.toBuffer();
		ext = 'jpg';
		mimeType = 'image/jpeg';
	}

	const filename = `${photoId}.${ext}`;
	const uploadDir = join(DATA_DIR, 'uploads', 'journal', companionId, date);
	await mkdir(uploadDir, { recursive: true });
	await writeFile(join(uploadDir, filename), processed);

	await db.insert(schema.journalPhotos).values({
		id: photoId,
		entryId: entry.id,
		filename,
		originalName: file.name,
		mimeType,
		sizeBytes: processed.length
	});

	return json({
		id: photoId,
		filename,
		url: `/api/photos/journal/${companionId}/${date}/${filename}`
	});
};

export const PATCH: RequestHandler = async ({ url, request, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const photoId = url.searchParams.get('photoId');
	if (!photoId) error(400, t(locals.locale, 'error.missingPhotoId'));

	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId)
	});
	if (!photo) error(404, t(locals.locale, 'error.photoNotFound'));

	const entry = await db.query.journalEntries.findFirst({
		where: eq(schema.journalEntries.id, photo.entryId),
		columns: { companionId: true }
	});
	if (!entry || entry.companionId !== params.companionId)
		error(403, t(locals.locale, 'error.forbidden'));

	const contentLength = parseInt(request.headers.get('content-length') ?? '0');
	if (contentLength > 10_000) error(400, t(locals.locale, 'error.requestBodyTooLarge'));
	const { notes } = await request.json();

	await db
		.update(schema.journalPhotos)
		.set({ notes: notes?.trim() || null })
		.where(eq(schema.journalPhotos.id, photoId));

	return json({ success: true });
};

export const DELETE: RequestHandler = async ({ url, params, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const photoId = url.searchParams.get('photoId');
	if (!photoId) error(400, t(locals.locale, 'error.missingPhotoId'));

	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.id, photoId)
	});
	if (!photo) error(404, t(locals.locale, 'error.photoNotFound'));

	const entry = await db.query.journalEntries.findFirst({
		where: eq(schema.journalEntries.id, photo.entryId),
		columns: { companionId: true }
	});
	if (!entry || entry.companionId !== params.companionId)
		error(403, t(locals.locale, 'error.forbidden'));

	const { unlink } = await import('fs/promises');
	const filePath = join(
		DATA_DIR,
		'uploads',
		'journal',
		params.companionId,
		params.date,
		photo.filename
	);
	try {
		await unlink(filePath);
	} catch {
		// File already gone; still delete the DB record
	}

	await db.delete(schema.journalPhotos).where(eq(schema.journalPhotos.id, photoId));

	return json({ success: true });
};
