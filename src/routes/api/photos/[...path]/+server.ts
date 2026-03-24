import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { createReadStream } from 'fs';
import { Readable } from 'stream';
import { stat } from 'fs/promises';
import { join, normalize, resolve } from 'path';
import { DATA_DIR } from '$lib/server/paths';

const UPLOAD_DIR = join(DATA_DIR, 'uploads');

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) error(401, 'Unauthorized');

	// Path traversal guard: resolve and ensure it stays within UPLOAD_DIR
	const requestedPath = normalize(params.path ?? '');
	const fullPath = resolve(join(UPLOAD_DIR, requestedPath));

	if (!fullPath.startsWith(resolve(UPLOAD_DIR))) {
		error(403, 'Forbidden');
	}

	// Verify the photo record exists in DB (don't serve arbitrary files)
	const filename = requestedPath.split('/').pop() ?? '';
	const photo = await db.query.journalPhotos.findFirst({
		where: eq(schema.journalPhotos.filename, filename)
	});
	if (!photo) error(404, 'Not found');

	// For caretakers, verify they are assigned to the companion that owns this photo
	if (locals.user.role === 'caretaker') {
		const entry = await db.query.journalEntries.findFirst({
			where: eq(schema.journalEntries.id, photo.entryId),
			columns: { companionId: true }
		});
		if (!entry) error(404, 'Not found');
		const assignment = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.companionId, entry.companionId),
				eq(schema.companionCaretakers.userId, locals.user.id)
			)
		});
		if (!assignment) error(403, 'Forbidden');
	}

	let fileStat: Awaited<ReturnType<typeof stat>>;
	try {
		fileStat = await stat(fullPath);
	} catch {
		error(404, 'File not found');
	}

	const etag = `"${fileStat.mtimeMs.toString(36)}-${fileStat.size.toString(36)}"`;

	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304 });
	}

	return new Response(Readable.toWeb(createReadStream(fullPath)) as ReadableStream, {
		headers: {
			'Content-Type': photo.mimeType,
			'Content-Length': String(fileStat.size),
			'Cache-Control': 'private, max-age=31536000, immutable',
			ETag: etag,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
