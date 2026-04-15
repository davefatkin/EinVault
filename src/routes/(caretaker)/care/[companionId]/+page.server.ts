import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '$lib/i18n';
import { db, schema } from '$lib/server/db';
import { eq, and, ne, gte, isNull } from 'drizzle-orm';
import { getShiftStatus } from '$lib/server/shifts';
import { completeReminder } from '$lib/server/reminders';

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { companions, isOnShift } = await parent();
	if (!companions.find((c) => c.id === params.companionId)) {
		error(403, t(locals.locale, 'error.notAssignedToCompanion'));
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const medications = await db.query.healthEvents.findMany({
		where: and(
			eq(schema.healthEvents.companionId, params.companionId),
			eq(schema.healthEvents.type, 'medication')
		),
		orderBy: (h, { desc }) => [desc(h.occurredAt)],
		with: { logger: { columns: { displayName: true } } }
	});

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayActivity = isOnShift
		? await db.query.dailyEvents.findMany({
				where: and(
					eq(schema.dailyEvents.companionId, params.companionId),
					gte(schema.dailyEvents.loggedAt, todayStart)
				),
				orderBy: (d, { asc }) => [asc(d.loggedAt)],
				with: { logger: { columns: { displayName: true } } }
			})
		: [];

	const latestWeight = await db.query.weightEntries.findFirst({
		where: eq(schema.weightEntries.companionId, params.companionId),
		orderBy: (w, { desc }) => [desc(w.recordedAt)]
	});

	const ownerUsers = await db.query.users.findMany({
		where: and(eq(schema.users.isActive, true), ne(schema.users.role, 'caretaker')),
		orderBy: (u, { asc }) => [asc(u.displayName)],
		columns: { id: true, displayName: true, phone: true, email: true }
	});

	const owners = ownerUsers.map((u) => ({
		id: u.id,
		displayName: u.displayName,
		phone: u.phone ?? null,
		email: u.email ?? null
	}));

	const now = new Date();
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));
	const [allReminders, upcomingShifts] = await Promise.all([
		db.query.reminders.findMany({
			where: and(
				eq(schema.reminders.companionId, params.companionId),
				isNull(schema.reminders.completedAt)
			),
			orderBy: (r, { asc }) => [asc(r.dueAt)],
			with: { logger: { columns: { displayName: true } } }
		}),
		db.query.caretakerShifts.findMany({
			where: and(
				eq(schema.caretakerShifts.userId, locals.user.id),
				gte(schema.caretakerShifts.endAt, now)
			),
			orderBy: (s, { asc }) => [asc(s.startAt)]
		})
	]);

	const upcomingReminders = allReminders
		.filter((r) => upcomingShifts.some((s) => r.dueAt >= s.startAt && r.dueAt <= s.endAt))
		.slice(0, 5);

	return {
		companion,
		medications,
		todayActivity,
		latestWeight: latestWeight ?? null,
		owners,
		upcomingReminders
	};
};

export const actions: Actions = {
	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const { isOnShift } = await getShiftStatus(locals.user.id);
		if (!isOnShift) return fail(403, { error: t(locals.locale, 'error.mustBeOnShiftToComplete') });

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(existing, locals.user.id);

		return { completeSuccess: true };
	}
};
