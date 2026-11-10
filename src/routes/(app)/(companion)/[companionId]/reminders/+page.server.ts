import { fail, redirect } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { t } from '#lib/i18n/index.js';
import { db, schema } from '#lib/server/db/index.js';
import { eq, and, lt, gt, isNotNull } from 'drizzle-orm';
import { generateId } from '#lib/server/utils.js';
import { parseReminderType, parseRecurrence } from '#lib/server/validation.js';
import { completeReminder, skipReminder } from '#lib/server/reminders.js';
import { validateLeadDays } from '#lib/reminderLeadTimes.js';
import { reminderLogEventUrl } from '#lib/health.js';
import { getMedication } from '#lib/server/medications.js';
import { restoreDoseStock } from '#lib/server/supplies.js';
import { isMedicationActive } from '#lib/medications.js';
import { localDateISO } from '#lib/date.js';

const LEAD_ERROR_KEYS = {
	invalid: 'error.invalidLeadDays',
	tooMany: 'error.tooManyLeadDays',
	tooLong: 'error.leadDaysTooLong'
} as const;

export const load: PageServerLoad = async ({ params, locals, parent }) => {
	if (!locals.user) redirect(302, '/auth/login');
	const { companion } = await parent();

	const reminders = await db.query.reminders.findMany({
		where: eq(schema.reminders.companionId, params.companionId),
		orderBy: (r, { asc }) => [asc(r.dueAt)],
		with: {
			logger: { columns: { displayName: true } },
			completer: { columns: { displayName: true } },
			// A dose reminder links back to its medication.
			medication: { columns: { id: true, name: true } }
		}
	});

	return {
		companion,
		reminders,
		defaultRecurrenceUnit: locals.user.defaultRecurrenceUnit ?? null
	};
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';

		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const recurrence = isRecurring ? parseRecurrence(data, dueAt) : null;
		if (isRecurring && !recurrence)
			return fail(400, { error: t(locals.locale, 'error.invalidRecurrence') });

		const leads = validateLeadDays(
			String(data.get('notifyLeadDays') ?? ''),
			recurrence ? { unit: recurrence.unit, interval: recurrence.interval } : null
		);
		if (!leads.ok) return fail(400, { error: t(locals.locale, LEAD_ERROR_KEYS[leads.reason]) });

		// A dose reminder from a medication's page: same companion, still active.
		const medicationId = String(data.get('medicationId') ?? '').trim() || null;
		if (medicationId) {
			const medication = await getMedication(params.companionId, medicationId);
			if (!medication) return fail(404, { error: t(locals.locale, 'error.medicationNotFound') });
			if (!isMedicationActive(medication.endedOn, localDateISO()))
				return fail(400, { error: t(locals.locale, 'error.medicationEnded') });
			if (medication.endedOn && localDateISO(dueAt) > medication.endedOn)
				return fail(400, { error: t(locals.locale, 'error.reminderAfterMedicationEnd') });
		}

		const id = generateId(15);
		await db.insert(schema.reminders).values({
			id,
			companionId: params.companionId,
			title,
			description,
			type,
			dueAt,
			isRecurring,
			recurrenceUnit: recurrence?.unit ?? null,
			recurrenceInterval: recurrence?.interval ?? null,
			recurrenceAnchor: recurrence?.anchor ?? null,
			recurrenceAnchorValue: recurrence?.anchorValue ?? null,
			seriesId: isRecurring ? id : null,
			notifyLeadDays: leads.value,
			leadArmedAt: leads.value ? new Date() : null,
			medicationId,
			loggedBy: locals.user.id
		});

		if (medicationId) redirect(303, `/${params.companionId}/medications/${medicationId}`);
		return { success: true };
	},

	update: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const description = String(data.get('description') ?? '').trim() || null;
		const type = parseReminderType(String(data.get('type') ?? ''));
		const dueAt = new Date(String(data.get('dueAt') ?? ''));
		const isRecurring = data.get('isRecurring') === 'on';

		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });
		if (!title) return fail(400, { error: t(locals.locale, 'error.titleRequired') });
		if (isNaN(dueAt.getTime()))
			return fail(400, { error: t(locals.locale, 'error.validDueDateRequired') });

		const recurrence = isRecurring ? parseRecurrence(data, dueAt) : null;
		if (isRecurring && !recurrence)
			return fail(400, { error: t(locals.locale, 'error.invalidRecurrence') });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true, dueAt: true, notifyLeadDays: true, medicationId: true }
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		// Only touch lead times when the form sends the field; an empty value clears them.
		// Re-arm only when the due date or the lead list actually changes.
		const leadFields: { notifyLeadDays?: string | null; leadArmedAt?: Date | null } = {};
		let nextLeads = existing.notifyLeadDays;
		if (data.has('notifyLeadDays')) {
			const leads = validateLeadDays(
				String(data.get('notifyLeadDays') ?? ''),
				recurrence ? { unit: recurrence.unit, interval: recurrence.interval } : null
			);
			if (!leads.ok) return fail(400, { error: t(locals.locale, LEAD_ERROR_KEYS[leads.reason]) });
			nextLeads = leads.value;
			leadFields.notifyLeadDays = leads.value;
		}
		// The datetime-local input drops seconds, so compare at minute precision.
		const dueChanged =
			Math.floor(existing.dueAt.getTime() / 60_000) !== Math.floor(dueAt.getTime() / 60_000);

		// A dose reminder can't move past its medication's last day (same rule as add).
		if (dueChanged && existing.medicationId) {
			const medication = await getMedication(params.companionId, existing.medicationId);
			if (medication?.endedOn && localDateISO(dueAt) > medication.endedOn)
				return fail(400, { error: t(locals.locale, 'error.reminderAfterMedicationEnd') });
		}
		if (dueChanged || nextLeads !== existing.notifyLeadDays) {
			leadFields.leadArmedAt = nextLeads ? new Date() : null;
		}

		await db
			.update(schema.reminders)
			.set({
				...leadFields,
				title,
				description,
				type,
				dueAt,
				isRecurring,
				recurrenceUnit: recurrence?.unit ?? null,
				recurrenceInterval: recurrence?.interval ?? null,
				recurrenceAnchor: recurrence?.anchor ?? null,
				recurrenceAnchorValue: recurrence?.anchorValue ?? null
			})
			.where(eq(schema.reminders.id, id));

		return { updateSuccess: true };
	},

	complete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const andEvent = data.get('andEvent') === '1';

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		completeReminder(existing, locals.user.id);

		// Prune completed non-recurring reminders older than 30 days
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		await db
			.delete(schema.reminders)
			.where(
				and(
					eq(schema.reminders.companionId, params.companionId),
					isNotNull(schema.reminders.completedAt),
					eq(schema.reminders.isRecurring, false),
					lt(schema.reminders.createdAt, thirtyDaysAgo)
				)
			);

		const logEventUrl = andEvent ? reminderLogEventUrl(existing) : null;
		if (logEventUrl) redirect(303, logEventUrl);

		return { completeSuccess: true };
	},

	skip: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
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

	restore: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!id) return fail(400, { error: t(locals.locale, 'error.missingId') });

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId))
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		const outcome = db.transaction(
			(tx) => {
				// An ended medication never gets an open reminder back (R1).
				if (existing.medicationId) {
					const medication = tx
						.select({ endedOn: schema.medications.endedOn })
						.from(schema.medications)
						.where(eq(schema.medications.id, existing.medicationId))
						.get();
					if (medication && !isMedicationActive(medication.endedOn, localDateISO()))
						return 'ended' as const;
				}

				// Undoing a completion undoes its dose and puts its supply use back.
				// Doses of later occurrences deleted below were really given: they
				// stay, unlinked by the FK, and so does their stock use.
				const doseIds = tx
					.select({ id: schema.medicationDoses.id })
					.from(schema.medicationDoses)
					.where(eq(schema.medicationDoses.reminderId, id))
					.all()
					.map((d) => d.id);
				restoreDoseStock(tx, doseIds);
				tx.delete(schema.medicationDoses).where(eq(schema.medicationDoses.reminderId, id)).run();

				tx.update(schema.reminders)
					.set({ completedAt: null, completedBy: null, outcome: null })
					.where(eq(schema.reminders.id, id))
					.run();

				// If recurring, delete all future instances in this series. Spawned
				// instances carry seriesId = origin.seriesId ?? origin.id, so match on
				// the same fallback: rows whose own seriesId is null still own the
				// instances their id seeded.
				if (existing.isRecurring) {
					tx.delete(schema.reminders)
						.where(
							and(
								eq(schema.reminders.seriesId, existing.seriesId ?? existing.id),
								gt(schema.reminders.dueAt, existing.dueAt)
							)
						)
						.run();
				}
				return 'restored' as const;
			},
			{ behavior: 'immediate' }
		);
		if (outcome === 'ended') return fail(400, { error: t(locals.locale, 'error.medicationEnded') });

		return { restoreSuccess: true };
	},

	delete: async ({ request, params, locals }) => {
		if (!locals.user) return fail(401, { error: t(locals.locale, 'error.unauthorized') });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');

		const existing = await db.query.reminders.findFirst({
			where: and(eq(schema.reminders.id, id), eq(schema.reminders.companionId, params.companionId)),
			columns: { id: true }
		});
		if (!existing) return fail(404, { error: t(locals.locale, 'error.reminderNotFound') });

		await db.delete(schema.reminders).where(eq(schema.reminders.id, id));
		return { deleteSuccess: true };
	}
};
