import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import sharp from 'sharp';
import { getStorage } from '$lib/server/storage';
import { UPLOAD_MAX_MB } from '$lib/server/env';

const MAX_SIZE = UPLOAD_MAX_MB * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const LEGACY_EXTS = ['jpg', 'png', 'webp'];

function avatarKey(companionId: string, ext: string): string {
	return `avatars/${companionId}.${ext}`;
}

async function assertCanEditAvatar(
	locals: import('@sveltejs/kit').RequestEvent['locals'],
	companionId: string
): Promise<void> {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	if (locals.user.role === 'caretaker') {
		const assigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.userId, locals.user.id),
				eq(schema.companionCaretakers.companionId, companionId)
			)
		});
		if (!assigned) error(403, t(locals.locale, 'error.forbidden'));
	}
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	await assertCanEditAvatar(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const formData = await request.formData();
	const file = formData.get('avatar') as File | null;

	if (!file || file.size === 0) error(400, t(locals.locale, 'error.noFileProvided'));
	if (file.size > MAX_SIZE)
		error(400, t(locals.locale, 'error.fileTooLarge', { max: UPLOAD_MAX_MB }));
	if (!ALLOWED_TYPES.includes(file.type))
		error(400, t(locals.locale, 'error.invalidFileTypeAvatar'));

	const storage = getStorage();

	// Remove any prior avatar regardless of legacy extension
	for (const ext of LEGACY_EXTS) {
		await storage.delete(avatarKey(params.companionId, ext));
	}

	const raw = Buffer.from(await file.arrayBuffer());
	const processed = await sharp(raw)
		.resize(512, 512, { fit: 'cover', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	const filename = `${params.companionId}.jpg`;
	await storage.put({
		key: avatarKey(params.companionId, 'jpg'),
		body: processed,
		contentType: 'image/jpeg'
	});

	await db
		.update(schema.companions)
		.set({ avatarPath: filename })
		.where(eq(schema.companions.id, params.companionId));

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await assertCanEditAvatar(locals, params.companionId);

	const storage = getStorage();
	for (const ext of LEGACY_EXTS) {
		await storage.delete(avatarKey(params.companionId, ext));
	}

	await db
		.update(schema.companions)
		.set({ avatarPath: null })
		.where(eq(schema.companions.id, params.companionId));

	return json({ success: true });
};
