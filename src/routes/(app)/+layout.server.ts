import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db, schema } from '$lib/server/db';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { localDateISO } from '$lib/date';
import { careStatus, type CareStatus } from '$lib/careStatus';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login');
	}

	// Caretakers have their own layout: boot them to /care
	if (locals.user.role === 'caretaker') {
		redirect(302, '/care');
	}

	const [companions, archivedCompanions] = await Promise.all([
		db.query.companions.findMany({
			where: eq(schema.companions.isActive, true),
			orderBy: (c, { asc }) => [asc(c.name)]
		}),
		db.query.companions.findMany({
			where: eq(schema.companions.isActive, false),
			orderBy: (c, { desc }) => [desc(c.archivedAt)]
		})
	]);

	// Compute per-companion care status in a single reminders query.
	// We fetch reminders due within the next 7 days (captures overdue + today + soon).
	const companionStatus: Record<string, CareStatus> = {};
	if (companions.length > 0) {
		const now = new Date();
		const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
		const ids = companions.map((c) => c.id);

		const upcomingReminders = await db
			.select({ companionId: schema.reminders.companionId, dueAt: schema.reminders.dueAt })
			.from(schema.reminders)
			.where(
				and(
					inArray(schema.reminders.companionId, ids),
					isNull(schema.reminders.completedAt),
					lte(schema.reminders.dueAt, in7d)
				)
			);

		// Group reminders by companionId
		const byCompanion = new Map<string, { dueAt: Date; completedAt: Date | null }[]>();
		for (const r of upcomingReminders) {
			const list = byCompanion.get(r.companionId) ?? [];
			list.push({ dueAt: r.dueAt, completedAt: null });
			byCompanion.set(r.companionId, list);
		}

		for (const c of companions) {
			companionStatus[c.id] = careStatus(byCompanion.get(c.id) ?? [], now);
		}
	}

	return {
		user: locals.user,
		companions,
		archivedCompanions,
		companionStatus,
		// Server-computed "today" (app timezone) so client links — e.g. the mobile
		// quick-add journal FAB — match the journal page's own notion of today.
		today: localDateISO()
	};
};
