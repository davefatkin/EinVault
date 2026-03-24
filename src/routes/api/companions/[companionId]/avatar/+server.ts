import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and } from 'drizzle-orm';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { env } from '$env/dynamic/private';
import sharp from 'sharp';
import { DATA_DIR } from '$lib/server/paths';

const MAX_SIZE = parseInt(env.UPLOAD_MAX_MB ?? '10') * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

async function assertCanEditAvatar(
	locals: import('@sveltejs/kit').RequestEvent['locals'],
	companionId: string
): Promise<void> {
	if (!locals.user) error(401, 'Unauthorized');
	if (locals.user.role === 'caretaker') {
		const assigned = await db.query.companionCaretakers.findFirst({
			where: and(
				eq(schema.companionCaretakers.userId, locals.user.id),
				eq(schema.companionCaretakers.companionId, companionId)
			)
		});
		if (!assigned) error(403, 'Forbidden');
	}
}

export const POST: RequestHandler = async ({ request, params, locals }) => {
	await assertCanEditAvatar(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, 'Not found');

	const formData = await request.formData();
	const file = formData.get('avatar') as File | null;

	if (!file || file.size === 0) error(400, 'No file provided');
	if (file.size > MAX_SIZE) error(400, `File too large (max ${env.UPLOAD_MAX_MB ?? '10'}MB)`);
	if (!ALLOWED_TYPES.includes(file.type))
		error(400, 'Invalid file type. Must be JPEG, PNG, or WebP.');

	const avatarDir = join(DATA_DIR, 'uploads', 'avatars');
	await mkdir(avatarDir, { recursive: true });

	// Remove old avatar regardless of extension
	for (const oldExt of ['jpg', 'png', 'webp']) {
		const old = join(avatarDir, `${params.companionId}.${oldExt}`);
		if (existsSync(old)) await unlink(old).catch(() => {});
	}

	const raw = Buffer.from(await file.arrayBuffer());
	const processed = await sharp(raw)
		.resize(512, 512, { fit: 'cover', withoutEnlargement: true })
		.jpeg({ quality: 85 })
		.toBuffer();

	const filename = `${params.companionId}.jpg`;
	await writeFile(join(avatarDir, filename), processed);

	await db
		.update(schema.companions)
		.set({ avatarPath: filename })
		.where(eq(schema.companions.id, params.companionId));

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await assertCanEditAvatar(locals, params.companionId);

	const avatarDir = join(DATA_DIR, 'uploads', 'avatars');
	for (const ext of ['jpg', 'png', 'webp']) {
		const p = join(avatarDir, `${params.companionId}.${ext}`);
		if (existsSync(p)) await unlink(p).catch(() => {});
	}

	await db
		.update(schema.companions)
		.set({ avatarPath: null })
		.where(eq(schema.companions.id, params.companionId));

	return json({ success: true });
};
