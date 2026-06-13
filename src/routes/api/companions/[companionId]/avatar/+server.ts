import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { avatarLegacyKey } from '$lib/server/storage/avatarKeys';
import { assertCanEditCompanion } from '$lib/server/permissions';
import { processAvatarUpload, deletePreviousAvatar, deleteAvatar } from '$lib/server/avatar';

export const POST: RequestHandler = async ({ request, params, locals }) => {
	await assertCanEditCompanion(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	const formData = await request.formData();
	const file = formData.get('avatar') as File | null;
	if (!file) error(400, t(locals.locale, 'error.noFileProvided'));

	const filename = `${params.companionId}.jpg`;
	const key = avatarLegacyKey(params.companionId, 'jpg');

	// Snapshot the prior avatar before any writes. We write the new blob and
	// update the DB first; only then do we delete what was there, so a
	// mid-flight failure leaves the old avatar live instead of broken.
	const { avatarPath, avatarProvider, avatarStorageKey } = await processAvatarUpload(
		file,
		key,
		filename,
		locals.locale
	);

	await db
		.update(schema.companions)
		.set({ avatarPath, avatarProvider, avatarStorageKey })
		.where(eq(schema.companions.id, params.companionId));

	await deletePreviousAvatar(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath,
		key,
		params.companionId
	);

	return json({ avatarPath: filename, url: `/api/avatars/${params.companionId}` });
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	await assertCanEditCompanion(locals, params.companionId);

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.notFound'));

	// DB first so a delete failure leaves the user with the old avatar still
	// referenced (which they can re-delete) rather than orphaned bytes.
	await db
		.update(schema.companions)
		.set({ avatarPath: null, avatarStorageKey: null, avatarProvider: 'local' })
		.where(eq(schema.companions.id, params.companionId));

	await deleteAvatar(
		companion.avatarProvider,
		companion.avatarStorageKey,
		companion.avatarPath,
		params.companionId
	);

	return json({ success: true });
};
