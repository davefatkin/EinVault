import { eq, inArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db, schema } from '$lib/server/db';
import { getUpcomingShifts } from '$lib/server/shifts';
import { reminderRecurrence, type Recurrence } from '$lib/server/calendarRrule';

export type CalendarKind = 'health' | 'reminder' | 'shift';

export interface CalendarItem {
	kind: CalendarKind;
	uid: string;
	companionId: string | null;
	companionName: string | null;
	title: string;
	start: Date;
	end?: Date;
	allDay: boolean;
	recurrence?: Recurrence;
}

export interface CalendarFilters {
	types: CalendarKind[]; // empty = all
	companionIds: string[]; // empty = all visible
	historyDays: number; // 0 = no lower bound
	now: Date;
}

interface FeedUser {
	id: string;
	role: 'admin' | 'member' | 'caretaker';
}

function feedTimezone(): string {
	return env.TZ?.trim() || 'UTC';
}

function wants(filters: CalendarFilters, kind: CalendarKind): boolean {
	return filters.types.length === 0 || filters.types.includes(kind);
}

async function visibleCompanions(user: FeedUser, companionIds: string[]) {
	const rows = await db.query.companions.findMany({
		where: eq(schema.companions.isActive, true)
	});
	let visible = rows;
	if (user.role === 'caretaker') {
		const assigned = await db.query.companionCaretakers.findMany({
			where: eq(schema.companionCaretakers.userId, user.id)
		});
		const assignedIds = new Set(assigned.map((a) => a.companionId));
		visible = visible.filter((c) => assignedIds.has(c.id));
	}
	if (companionIds.length > 0) {
		const want = new Set(companionIds);
		visible = visible.filter((c) => want.has(c.id));
	}
	return visible;
}

export async function getCalendarItems(
	user: FeedUser,
	filters: CalendarFilters
): Promise<CalendarItem[]> {
	const companions = await visibleCompanions(user, filters.companionIds);
	const nameById = new Map(companions.map((c) => [c.id, c.name]));
	const ids = companions.map((c) => c.id);
	const lower =
		filters.historyDays > 0
			? new Date(filters.now.getTime() - filters.historyDays * 24 * 60 * 60 * 1000)
			: null;
	const items: CalendarItem[] = [];

	if (ids.length > 0 && wants(filters, 'health')) {
		const health = await db.query.healthEvents.findMany({
			where: inArray(schema.healthEvents.companionId, ids)
		});
		for (const h of health) {
			if (lower && h.occurredAt < lower) continue;
			items.push({
				kind: 'health',
				uid: `health-${h.id}@einvault`,
				companionId: h.companionId,
				companionName: nameById.get(h.companionId) ?? null,
				title: h.title,
				start: h.occurredAt,
				allDay: true
			});
		}
	}

	if (ids.length > 0 && wants(filters, 'reminder')) {
		const reminders = await db.query.reminders.findMany({
			where: inArray(schema.reminders.companionId, ids)
		});
		const seriesAnchored = new Set<string>();
		for (const r of reminders) {
			const companionName = nameById.get(r.companionId) ?? null;
			if (r.isRecurring) {
				const seriesKey = r.seriesId ?? r.id;
				if (r.completedAt === null) {
					if (seriesAnchored.has(seriesKey)) continue;
					seriesAnchored.add(seriesKey);
					items.push({
						kind: 'reminder',
						uid: `reminder-series-${seriesKey}@einvault`,
						companionId: r.companionId,
						companionName,
						title: r.title,
						start: r.dueAt,
						allDay: false,
						recurrence: reminderRecurrence(r, r.dueAt, feedTimezone()) ?? undefined
					});
				} else {
					if (lower && r.dueAt < lower) continue;
					items.push({
						kind: 'reminder',
						uid: `reminder-${r.id}@einvault`,
						companionId: r.companionId,
						companionName,
						title: r.title,
						start: r.dueAt,
						allDay: false
					});
				}
			} else {
				if (lower && r.dueAt < lower) continue;
				items.push({
					kind: 'reminder',
					uid: `reminder-${r.id}@einvault`,
					companionId: r.companionId,
					companionName,
					title: r.title,
					start: r.dueAt,
					allDay: false
				});
			}
		}
	}

	if (user.role === 'caretaker' && wants(filters, 'shift')) {
		const shifts = await getUpcomingShifts(user.id);
		for (const s of shifts) {
			items.push({
				kind: 'shift',
				uid: `shift-${s.id}@einvault`,
				companionId: null,
				companionName: null,
				title: '',
				start: s.startAt,
				end: s.endAt,
				allDay: false
			});
		}
	}

	return items;
}
