import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { avatarLegacyKey } from '$lib/server/storage/avatarKeys';
import { processAvatarUpload, deletePreviousAvatar, deleteAvatar } from '$lib/server/avatar';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const userId = locals.user.id;
	const entityId = `user-${userId}`;
	const filename = `${entityId}.jpg`;
	const key = avatarLegacyKey(entityId, 'jpg');

	const formData = await request.formData();
	const file = formData.get('avatar') as File | null;
	if (!file) error(400, t(locals.locale, 'error.noFileProvided'));

	// Fetch prior avatar fields before writing, so we can clean up afterward.
	const existing = await db.query.users.findFirst({
		where: eq(schema.users.id, userId),
		columns: { avatarPath: true, avatarProvider: true, avatarStorageKey: true }
	});

	const { avatarPath, avatarProvider, avatarStorageKey } = await processAvatarUpload(
		file,
		key,
		filename,
		locals.locale
	);

	await db
		.update(schema.users)
		.set({ avatarPath, avatarProvider, avatarStorageKey })
		.where(eq(schema.users.id, userId));

	if (existing) {
		await deletePreviousAvatar(
			existing.avatarProvider,
			existing.avatarStorageKey,
			existing.avatarPath,
			key,
			entityId
		);
	}

	return json({ avatarPath: filename, url: `/api/users/${userId}/avatar` });
};

export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const userId = locals.user.id;
	const entityId = `user-${userId}`;

	const existing = await db.query.users.findFirst({
		where: eq(schema.users.id, userId),
		columns: { avatarPath: true, avatarProvider: true, avatarStorageKey: true }
	});

	// DB first so a delete failure leaves the user with the old avatar still
	// referenced (which they can re-delete) rather than orphaned bytes.
	await db
		.update(schema.users)
		.set({ avatarPath: null, avatarProvider: null, avatarStorageKey: null })
		.where(eq(schema.users.id, userId));

	if (existing) {
		await deleteAvatar(
			existing.avatarProvider,
			existing.avatarStorageKey,
			existing.avatarPath,
			entityId
		);
	}

	return json({ success: true });
};
