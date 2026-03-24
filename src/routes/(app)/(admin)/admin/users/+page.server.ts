import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, and, ne, lt, gt } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';
import bcrypt from 'bcryptjs';
import { invalidateAllUserSessions } from '$lib/server/auth/session';
import { parseRole } from '$lib/server/validation';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) redirect(302, '/auth/login');
	if (locals.user.role !== 'admin') error(403, 'Forbidden');

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
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const displayName = String(data.get('displayName') ?? '').trim();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');
		const role = parseRole(String(data.get('role') ?? 'member')) ?? 'member';

		if (!displayName || !username || !password) {
			return fail(400, { createError: 'All fields are required.' });
		}
		if (!/^[a-z0-9_-]+$/.test(username)) {
			return fail(400, { createError: 'Invalid username format.' });
		}
		if (password.length < 8) {
			return fail(400, { createError: 'Password must be at least 8 characters.' });
		}
		if (password.length > 128) {
			return fail(400, { createError: 'Password must be 128 characters or fewer.' });
		}

		const existing = await db.query.users.findFirst({
			where: eq(schema.users.username, username)
		});
		if (existing) {
			return fail(400, { createError: 'Username already taken.' });
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
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');

		if (userId === locals.user.id) {
			return fail(400, { toggleError: 'You cannot deactivate your own account.' });
		}

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user) return fail(404, { toggleError: 'User not found.' });

		const newIsActive = !user.isActive;
		await db.update(schema.users).set({ isActive: newIsActive }).where(eq(schema.users.id, userId));

		if (!newIsActive) {
			await invalidateAllUserSessions(userId);
		}

		return { toggleSuccess: true };
	},

	resetPassword: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const newPassword = String(data.get('newPassword') ?? '');

		if (!userId) return fail(400, { resetError: 'Missing user ID.' });
		if (newPassword.length < 8) {
			return fail(400, { resetError: 'Password must be at least 8 characters.' });
		}
		if (newPassword.length > 128) {
			return fail(400, { resetError: 'Password must be 128 characters or fewer.' });
		}

		const target = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!target) return fail(404, { resetError: 'User not found.' });

		const passwordHash = await bcrypt.hash(newPassword, 12);
		await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));

		await invalidateAllUserSessions(userId);

		return { resetSuccess: true };
	},

	addShift: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const startAt = new Date(String(data.get('startAt') ?? ''));
		const endAt = new Date(String(data.get('endAt') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;

		if (!userId) return fail(400, { shiftError: 'Missing user ID.' });
		if (isNaN(startAt.getTime())) return fail(400, { shiftError: 'Valid start time is required.' });
		if (isNaN(endAt.getTime())) return fail(400, { shiftError: 'Valid end time is required.' });
		if (endAt <= startAt) return fail(400, { shiftError: 'End time must be after start time.' });

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user || user.role !== 'caretaker') {
			return fail(400, { shiftError: 'User is not a caretaker.' });
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
				shiftError: 'This shift overlaps with an existing shift for this caretaker.'
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
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const shiftId = String(data.get('shiftId') ?? '');
		const startAt = new Date(String(data.get('startAt') ?? ''));
		const endAt = new Date(String(data.get('endAt') ?? ''));
		const notes = String(data.get('notes') ?? '').trim() || null;

		if (!shiftId) return fail(400, { shiftError: 'Missing shift ID.' });
		if (isNaN(startAt.getTime())) return fail(400, { shiftError: 'Valid start time is required.' });
		if (isNaN(endAt.getTime())) return fail(400, { shiftError: 'Valid end time is required.' });
		if (endAt <= startAt) return fail(400, { shiftError: 'End time must be after start time.' });

		const existingShift = await db.query.caretakerShifts.findFirst({
			where: eq(schema.caretakerShifts.id, shiftId)
		});
		if (!existingShift) return fail(404, { shiftError: 'Shift not found.' });

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
				shiftError: 'This shift overlaps with an existing shift for this caretaker.'
			});

		await db
			.update(schema.caretakerShifts)
			.set({ startAt, endAt, notes })
			.where(eq(schema.caretakerShifts.id, shiftId));

		return { shiftUpdateSuccess: true };
	},

	deleteShift: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const shiftId = String(data.get('shiftId') ?? '');
		if (!shiftId) return fail(400, { shiftError: 'Missing shift ID.' });

		await db.delete(schema.caretakerShifts).where(eq(schema.caretakerShifts.id, shiftId));
		return { shiftDeleteSuccess: true };
	},

	editUser: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const displayName = String(data.get('displayName') ?? '').trim();
		const username = String(data.get('username') ?? '')
			.trim()
			.toLowerCase();
		const email = String(data.get('email') ?? '').trim() || null;
		const phone = String(data.get('phone') ?? '').trim() || null;
		const role = parseRole(String(data.get('role') ?? ''));

		if (!userId) return fail(400, { editError: 'Missing user ID.' });
		if (!displayName) return fail(400, { editError: 'Display name is required.' });
		if (!username) return fail(400, { editError: 'Username is required.' });
		if (!/^[a-z0-9_-]+$/.test(username))
			return fail(400, { editError: 'Invalid username format.' });
		if (!role) return fail(400, { editError: 'Invalid role.' });

		const conflict = await db.query.users.findFirst({
			where: and(eq(schema.users.username, username), ne(schema.users.id, userId))
		});
		if (conflict) return fail(400, { editError: 'Username already taken.' });

		await db
			.update(schema.users)
			.set({ displayName, username, email, phone, role })
			.where(eq(schema.users.id, userId));

		return { editSuccess: true };
	},

	assignCompanions: async ({ request, locals }) => {
		if (locals.user?.role !== 'admin') error(403, 'Forbidden');

		const data = await request.formData();
		const userId = String(data.get('userId') ?? '');
		const companionIds = data.getAll('companionId').map(String);

		if (!userId) return fail(400, { assignError: 'Missing user ID.' });

		const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
		if (!user || user.role !== 'caretaker') {
			return fail(400, { assignError: 'User is not a caretaker.' });
		}

		if (companionIds.length > 0) {
			const validCompanions = await db.query.companions.findMany({
				where: eq(schema.companions.isActive, true),
				columns: { id: true }
			});
			const validIds = new Set(validCompanions.map((c) => c.id));
			const allValid = companionIds.every((id) => validIds.has(id));
			if (!allValid) return fail(400, { assignError: 'One or more companion IDs are invalid.' });
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
