import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { eq, inArray } from 'drizzle-orm';
import { getShiftStatus } from '$lib/server/shifts';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}
	if (locals.user.role !== 'caretaker') {
		redirect(302, '/');
	}

	const assignments = await db.query.companionCaretakers.findMany({
		where: eq(schema.companionCaretakers.userId, locals.user.id)
	});
	const assignedIds = assignments.map((a) => a.companionId);

	const companions =
		assignedIds.length > 0
			? await db.query.companions.findMany({
					where: (c, { and }) => and(eq(c.isActive, true), inArray(c.id, assignedIds)),
					orderBy: (c, { asc }) => [asc(c.name)]
				})
			: [];

	const { isOnShift, activeShift, nextShift } = await getShiftStatus(locals.user.id);

	return { user: locals.user, companions, isOnShift, activeShift, nextShift };
};
