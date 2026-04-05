import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, ne, lt, gt } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import bcrypt from 'bcryptjs';
import { invalidateAllUserSessions } from '$lib/server/auth/session';
import { parseRole } from '$lib/server/validation';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

	const users = await db.query.users.findMany({
		orderBy: (u, { asc }) => [asc(u.createdAt)],
		columns: {
			passwordHash: false
		}
	});

	const companions = await db.query.companions.findMany({
		where: eq(schema.companions.isActive, true),
		orderBy: (c, { asc }) => [asc(c.name)]
	});

	const assignments = await db.query.companionCaretakers.findMany();

	const shifts = await db.query.caretakerShifts.findMany({
		orderBy: (s, { asc }) => [asc(s.startAt)]
	});

	return { users, companions, assignments, shifts, currentUserId: locals.user.id };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const displayName = String(data.get('displayName') ?? '').trim();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');
		const role = parseRole(String(data.get('role') ?? 'member')) ?? 'member';

		if (!displayName || !username || !password) {
			return fail(400, { createError: t(locals.locale, 'error.allFieldsRequired') });
		}
		if (!/^[a-z0-9_-]+$/.test(username)) {
			return fail(400, { createError: t(locals.locale, 'error.invalidUsernameFormat') });
		}
		if (password.length < 8) {
			return fail(400, { createError: t(locals.locale, 'error.passwordTooShort') });
		}
		if (password.length > 128) {
			return fail(400, { createError: t(locals.locale, 'error.passwordTooLong') });
		}

		const existing = await db.query.users.findFirst({
			where: eq(schema.users.username, username)
		});
		if (existing) {
			return fail(400, { createError: t(locals.locale, 'error.usernameAlreadyTaken') });
		}

		const passwordHash = await bcrypt.hash(password, 12);
		await db.insert(schema.users).values({
			id: generateId(15),
			username,
			displayName,
			passwordHash,
			role
		});

		return { createSuccess: true };
	},

	toggleActive: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');

		if (userId === locals.user.id) {
			return fail(400, { toggleError: t(locals.locale, 'error.cannotDeactivateOwnAccount') });
		}

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user) return fail(404, { toggleError: t(locals.locale, 'error.userNotFound') });

		const newIsActive = !user.isActive;
		await db.update(schema.users).set({ isActive: newIsActive }).where(eq(schema.users.id, userId));

		if (!newIsActive) {
			await invalidateAllUserSessions(userId);
		}

		return { toggleSuccess: true };
	},

	resetPassword: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');

		if (!userId) return fail(400, { resetError: t(locals.locale, 'error.missingUserId') });
		if (newPassword.length < 8) {
			return fail(400, { resetError: t(locals.locale, 'error.passwordTooShort') });
		}
		if (newPassword.length > 128) {
			return fail(400, { resetError: t(locals.locale, 'error.passwordTooLong') });
		}

		const target = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!target) return fail(404, { resetError: t(locals.locale, 'error.userNotFound') });

		const passwordHash = await bcrypt.hash(newPassword, 12);
		await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));

		await invalidateAllUserSessions(userId);

		return { resetSuccess: true };
	},

	addShift: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const startAt = new Date(String(data.get('startAt') ?? ''));
		const endAt = new Date(String(data.get('endAt') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;

		if (!userId) return fail(400, { shiftError: t(locals.locale, 'error.missingUserId') });
		if (isNaN(startAt.getTime()))
			return fail(400, { shiftError: t(locals.locale, 'error.validStartTimeRequired') });
		if (isNaN(endAt.getTime()))
			return fail(400, { shiftError: t(locals.locale, 'error.validEndTimeRequired') });
		if (endAt <= startAt)
			return fail(400, { shiftError: t(locals.locale, 'error.endTimeAfterStartTime') });

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user || user.role !== 'caretaker') {
			return fail(400, { shiftError: t(locals.locale, 'error.userNotCaretaker') });
		}

		const overlapping = await db.query.caretakerShifts.findFirst({
			where: and(
				eq(schema.caretakerShifts.userId, userId),
				lt(schema.caretakerShifts.startAt, endAt),
				gt(schema.caretakerShifts.endAt, startAt)
			),
			columns: { id: true }
		});
		if (overlapping)
			return fail(400, {
				shiftError: t(locals.locale, 'error.shiftOverlap')
			});

		await db.insert(schema.caretakerShifts).values({
			id: generateId(15),
			userId,
			startAt,
			endAt,
			notes
		});

		return { shiftAddSuccess: true };
	},

	updateShift: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const shiftId = String(data.get('shiftId') ?? '');
		const startAt = new Date(String(data.get('startAt') ?? ''));
		const endAt = new Date(String(data.get('endAt') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;

		if (!shiftId) return fail(400, { shiftError: t(locals.locale, 'error.missingShiftId') });
		if (isNaN(startAt.getTime()))
			return fail(400, { shiftError: t(locals.locale, 'error.validStartTimeRequired') });
		if (isNaN(endAt.getTime()))
			return fail(400, { shiftError: t(locals.locale, 'error.validEndTimeRequired') });
		if (endAt <= startAt)
			return fail(400, { shiftError: t(locals.locale, 'error.endTimeAfterStartTime') });

		const existingShift = await db.query.caretakerShifts.findFirst({
			where: eq(schema.caretakerShifts.id, shiftId)
		});
		if (!existingShift) return fail(404, { shiftError: t(locals.locale, 'error.shiftNotFound') });

		const overlapping = await db.query.caretakerShifts.findFirst({
			where: and(
				eq(schema.caretakerShifts.userId, existingShift.userId),
				ne(schema.caretakerShifts.id, shiftId),
				lt(schema.caretakerShifts.startAt, endAt),
				gt(schema.caretakerShifts.endAt, startAt)
			),
			columns: { id: true }
		});
		if (overlapping)
			return fail(400, {
				shiftError: t(locals.locale, 'error.shiftOverlap')
			});

		await db
			.update(schema.caretakerShifts)
			.set({ startAt, endAt, notes })
			.where(eq(schema.caretakerShifts.id, shiftId));

		return { shiftUpdateSuccess: true };
	},

	deleteShift: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const shiftId = String(data.get('shiftId') ?? '');
		if (!shiftId) return fail(400, { shiftError: t(locals.locale, 'error.missingShiftId') });

		await db.delete(schema.caretakerShifts).where(eq(schema.caretakerShifts.id, shiftId));
		return { shiftDeleteSuccess: true };
	},

	editUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const displayName = String(data.get('displayName') ?? '').trim();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const email = String(data.get('email') ?? '').trim() || null;
		const phone = String(data.get('phone') ?? '').trim() || null;
		const role = parseRole(String(data.get('role') ?? ''));

		if (!userId) return fail(400, { editError: t(locals.locale, 'error.missingUserId') });
		if (!displayName)
			return fail(400, { editError: t(locals.locale, 'error.displayNameRequired') });
		if (!username) return fail(400, { editError: t(locals.locale, 'error.usernameRequired') });
		if (!/^[a-z0-9_-]+$/.test(username))
			return fail(400, { editError: t(locals.locale, 'error.invalidUsernameFormat') });
		if (!role) return fail(400, { editError: t(locals.locale, 'error.invalidRole') });

		const conflict = await db.query.users.findFirst({
			where: and(eq(schema.users.username, username), ne(schema.users.id, userId))
		});
		if (conflict) return fail(400, { editError: t(locals.locale, 'error.usernameAlreadyTaken') });

		await db
			.update(schema.users)
			.set({ displayName, username, email, phone, role })
			.where(eq(schema.users.id, userId));

		return { editSuccess: true };
	},

	assignCompanions: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, t(locals.locale, 'error.forbidden'));

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const companionIds = data.getAll('companionId').map(String);

		if (!userId) return fail(400, { assignError: t(locals.locale, 'error.missingUserId') });

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user || user.role !== 'caretaker') {
			return fail(400, { assignError: t(locals.locale, 'error.userNotCaretaker') });
		}

		if (companionIds.length > 0) {
			const validCompanions = await db.query.companions.findMany({
				where: eq(schema.companions.isActive, true),
				columns: { id: true }
			});
			const validIds = new Set(validCompanions.map((c) => c.id));
			const allValid = companionIds.every((id) => validIds.has(id));
			if (!allValid)
				return fail(400, { assignError: t(locals.locale, 'error.invalidCompanionIds') });
		}

		db.transaction((tx) => {
			tx.delete(schema.companionCaretakers)
				.where(eq(schema.companionCaretakers.userId, userId))
				.run();

			if (companionIds.length > 0) {
				tx.insert(schema.companionCaretakers)
					.values(companionIds.map((companionId) => ({ companionId, userId })))
					.run();
			}
		});

		return { assignSuccess: true };
	}
};
