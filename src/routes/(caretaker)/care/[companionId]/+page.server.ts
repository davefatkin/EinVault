import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t, type Locale } from '$lib/i18n';
import type { MessageKey } from '$lib/i18n/en';
import { db, schema } from '$lib/server/db';
import { eq, and, ne, gte, isNull } from 'drizzle-orm';
import { getShiftStatus } from '$lib/server/shifts';
import { completeReminder, skipReminder } from '$lib/server/reminders';
import { listQuickLogButtons } from '$lib/server/quick-logs';
import { handleQuickLogExecute } from '$lib/server/quick-log-actions';

// Actions need their own assignment + shift gate: the load()'s assignment
// check does not protect POSTs, so without this an on-shift caretaker could
// act on companions they are not assigned to.
async function caretakerActionGuard(
	userId: string,
	companionId: string,
	locale: Locale,
	shiftErrorKey: MessageKey
) {
	const assigned = await db.query.companionCaretakers.findFirst({
		where: and(
			eq(schema.companionCaretakers.userId, userId),
			eq(schema.companionCaretakers.companionId, companionId)
		)
	});
	if (!assigned) return fail(403, { error: t(locale, 'error.notAssignedToCompanion') });

	const { isOnShift } = await getShiftStatus(userId);
	if (!isOnShift) return fail(403, { error: t(locale, shiftErrorKey) });

	return null;
}

export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { companions, isOnShift } = await parent();
	if (!companions.find((c) => c.id === params.companionId)) {
		error(403, t(locals.locale, 'error.notAssignedToCompanion'));
	}

	const companion = await db.query.companions.findFirst({
		where: eq(schema.companions.id, params.companionId)
	});
	if (!companion) error(404, t(locals.locale, 'error.companionNotFound'));

	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);
	const todayActivity = isOnShift
		? await db.query.dailyEvents.findMany({
				where: and(
					eq(schema.dailyEvents.companionId, params.companionId),
					gte(schema.dailyEvents.loggedAt, todayStart)
				),
				orderBy: (d, { desc }) => [desc(d.createdAt)],
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

	// Custom quick log buttons render only inside the shift gate.
	const quickLogButtons = isOnShift
		? await listQuickLogButtons({ id: locals.user.id, role: locals.user.role }, params.companionId)
		: [];

	return {
		companion,
		todayActivity,
		latestWeight: latestWeight ?? null,
		owners,
		upcomingReminders,
		quickLogButtons
	};
};

export const actions: Actions = {
	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const guard = await caretakerActionGuard(
			locals.user.id,
			params.companionId,
			locals.locale,
			'error.mustBeOnShiftToComplete'
		);
		if (guard) return guard;

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(existing, locals.user.id);

		return { completeSuccess: true };
	},

	skip: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });

		const guard = await caretakerActionGuard(
			locals.user.id,
			params.companionId,
			locals.locale,
			'error.mustBeOnShiftToSkip'
		);
		if (guard) return guard;

		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });
		if (!existing.isRecurring)
			return fail(400, { error: t(locals.locale, 'error.cannotSkipNonRecurring') });

		skipReminder(existing, locals.user.id);

		return { skipSuccess: true };
	},

	executeQuickLog: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		return handleQuickLogExecute(locals.user, request, locals.locale);
	}
};
