import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { generateId } from '$lib/server/utils';
import { logDailyEvent } from '$lib/server/daily-events';
import { listAllowedCompanions } from '$lib/server/companion-scope';
import type { DailyEventType, UserRole } from '$lib/server/validation';
import { ACTIVITY_HAS_DURATION } from '$lib/i18n/labels';
import { parseSubtypes } from '$lib/activitySubtypes';

export interface QuickLogInput {
	name: string;
	type: DailyEventType;
	durationMinutes: number | null;
	subtypes: string[];
	note: string | null;
	isEnabled: boolean;
	companionIds: string[];
}

function normalizeDuration(type: DailyEventType, durationMinutes: number | null): number | null {
	return ACTIVITY_HAS_DURATION[type] ? durationMinutes : null;
}

function normalizeSubtypes(type: DailyEventType, subtypes: string[]): string[] | null {
	const list = parseSubtypes(type, subtypes);
	return list.length ? list : null;
}

function parseLastCompanionIds(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
	} catch {
		return [];
	}
}

// Full list for the management page, assignments included.
export async function listQuickLogs(userId: string) {
	return db.query.quickLogs.findMany({
		where: eq(schema.quickLogs.userId, userId),
		with: { companions: { columns: { companionId: true } } },
		orderBy: (q, { asc }) => [asc(q.sortOrder), asc(q.createdAt)]
	});
}

export interface QuickLogButton {
	id: string;
	name: string;
	type: DailyEventType;
	durationMinutes: number | null;
	subtypes: string[];
	note: string | null;
	rememberAlso: boolean;
	companionIds: string[];
	// Resolved prefill: remembered targets ∩ allowed, seeded with the page's
	// primary companion when given. Never empty unless the quick log has no
	// executable target at all.
	prefillCompanionIds: string[];
}

// Enabled buttons for rendering. companionId scopes to a detail page (only
// quick logs assigned to that companion, prefill always includes it).
export async function listQuickLogButtons(
	user: { id: string; role: UserRole },
	companionId?: string
): Promise<QuickLogButton[]> {
	const rows = await db.query.quickLogs.findMany({
		where: and(eq(schema.quickLogs.userId, user.id), eq(schema.quickLogs.isEnabled, true)),
		with: { companions: { columns: { companionId: true } } },
		orderBy: (q, { asc }) => [asc(q.sortOrder), asc(q.createdAt)]
	});
	const allowed = new Set(await listAllowedCompanions(user));

	return rows
		.map((row) => {
			const assigned = row.companions.map((c) => c.companionId).filter((id) => allowed.has(id));
			const remembered = parseLastCompanionIds(row.lastCompanionIds).filter((id) =>
				assigned.includes(id)
			);
			let prefill = remembered.length > 0 ? remembered : assigned;
			if (companionId) {
				prefill = [...new Set([companionId, ...prefill])].filter((id) => assigned.includes(id));
			}
			return {
				id: row.id,
				name: row.name,
				type: row.type,
				durationMinutes: row.durationMinutes,
				subtypes: row.subtypes ?? [],
				note: row.note,
				rememberAlso: row.rememberAlso,
				companionIds: assigned,
				prefillCompanionIds: prefill
			};
		})
		.filter(
			(b) => b.companionIds.length > 0 && (!companionId || b.companionIds.includes(companionId))
		);
}

export async function createQuickLog(
	user: { id: string; role: UserRole },
	input: QuickLogInput
): Promise<string> {
	const allowed = new Set(await listAllowedCompanions(user));
	const companionIds = input.companionIds.filter((id) => allowed.has(id));
	const existing = await listQuickLogs(user.id);
	const sortOrder = existing.length > 0 ? Math.max(...existing.map((q) => q.sortOrder)) + 1 : 0;
	const id = generateId(15);

	db.transaction((tx) => {
		tx.insert(schema.quickLogs)
			.values({
				id,
				userId: user.id,
				name: input.name,
				type: input.type,
				durationMinutes: normalizeDuration(input.type, input.durationMinutes),
				subtypes: normalizeSubtypes(input.type, input.subtypes),
				note: input.note,
				sortOrder,
				isEnabled: input.isEnabled
			})
			.run();
		if (companionIds.length > 0) {
			tx.insert(schema.quickLogCompanions)
				.values(companionIds.map((companionId) => ({ quickLogId: id, companionId })))
				.run();
		}
	});
	return id;
}

export async function updateQuickLog(
	user: { id: string; role: UserRole },
	id: string,
	input: QuickLogInput
): Promise<boolean> {
	const existing = await db.query.quickLogs.findFirst({
		where: and(eq(schema.quickLogs.id, id), eq(schema.quickLogs.userId, user.id))
	});
	if (!existing) return false;

	const allowed = new Set(await listAllowedCompanions(user));
	const companionIds = input.companionIds.filter((idc) => allowed.has(idc));

	db.transaction((tx) => {
		tx.update(schema.quickLogs)
			.set({
				name: input.name,
				type: input.type,
				durationMinutes: normalizeDuration(input.type, input.durationMinutes),
				subtypes: normalizeSubtypes(input.type, input.subtypes),
				note: input.note,
				isEnabled: input.isEnabled
			})
			.where(eq(schema.quickLogs.id, id))
			.run();
		// Assignment set is replaced wholesale (delete-all-then-reinsert, same as
		// admin caretaker assignment).
		tx.delete(schema.quickLogCompanions).where(eq(schema.quickLogCompanions.quickLogId, id)).run();
		if (companionIds.length > 0) {
			tx.insert(schema.quickLogCompanions)
				.values(companionIds.map((companionId) => ({ quickLogId: id, companionId })))
				.run();
		}
	});
	return true;
}

export async function deleteQuickLog(userId: string, id: string): Promise<boolean> {
	const result = await db
		.delete(schema.quickLogs)
		.where(and(eq(schema.quickLogs.id, id), eq(schema.quickLogs.userId, userId)));
	return result.changes > 0;
}

export async function setQuickLogEnabled(
	userId: string,
	id: string,
	isEnabled: boolean
): Promise<boolean> {
	const result = await db
		.update(schema.quickLogs)
		.set({ isEnabled })
		.where(and(eq(schema.quickLogs.id, id), eq(schema.quickLogs.userId, userId)));
	return result.changes > 0;
}

// Swap sortOrder with the neighbor; renumbers 0..n-1 on the way so legacy
// default-0 rows self-heal into a stable order.
export async function moveQuickLog(userId: string, id: string, dir: 'up' | 'down'): Promise<void> {
	const list = await listQuickLogs(userId);
	const index = list.findIndex((q) => q.id === id);
	if (index === -1) return;
	const target = dir === 'up' ? index - 1 : index + 1;
	if (target < 0 || target >= list.length) return;

	const order = list.map((q) => q.id);
	[order[index], order[target]] = [order[target], order[index]];

	db.transaction((tx) => {
		order.forEach((qid, i) => {
			tx.update(schema.quickLogs)
				.set({ sortOrder: i })
				.where(and(eq(schema.quickLogs.id, qid), eq(schema.quickLogs.userId, userId)))
				.run();
		});
	});
}

// Share = copy: each active recipient gets an independent duplicate appended
// to their own list. Assignments are intersected with what the recipient may
// target (caretaker recipients only keep companions they're assigned to).
// Returns how many copies were created.
export async function shareQuickLog(
	ownerId: string,
	id: string,
	recipientUserIds: string[]
): Promise<number> {
	const source = await db.query.quickLogs.findFirst({
		where: and(eq(schema.quickLogs.id, id), eq(schema.quickLogs.userId, ownerId)),
		with: { companions: { columns: { companionId: true } } }
	});
	if (!source) return 0;

	const recipients = recipientUserIds.length
		? await db.query.users.findMany({
				where: and(inArray(schema.users.id, recipientUserIds), eq(schema.users.isActive, true))
			})
		: [];

	let copied = 0;
	for (const recipient of recipients) {
		if (recipient.id === ownerId) continue;
		const allowed = new Set(
			await listAllowedCompanions({ id: recipient.id, role: recipient.role })
		);
		const companionIds = source.companions
			.map((c) => c.companionId)
			.filter((cid) => allowed.has(cid));
		// A recipient who can target none of the source's companions would get a
		// dead, unusable copy — skip them (and don't inflate the "copied to N"
		// count) rather than inserting an empty quick log.
		if (companionIds.length === 0) continue;
		const existing = await listQuickLogs(recipient.id);
		const sortOrder = existing.length > 0 ? Math.max(...existing.map((q) => q.sortOrder)) + 1 : 0;
		const copyId = generateId(15);

		db.transaction((tx) => {
			tx.insert(schema.quickLogs)
				.values({
					id: copyId,
					userId: recipient.id,
					name: source.name,
					type: source.type,
					durationMinutes: source.durationMinutes,
					subtypes: source.subtypes,
					note: source.note,
					sortOrder,
					// Shared copies arrive disabled: the recipient must opt in from their
					// own list before it renders as a tappable button. Prevents a peer
					// silently injecting a live logging button into someone else's UI.
					isEnabled: false
				})
				.run();
			tx.insert(schema.quickLogCompanions)
				.values(companionIds.map((companionId) => ({ quickLogId: copyId, companionId })))
				.run();
		});
		copied++;
	}
	return copied;
}

export type ExecuteQuickLogError =
	'notFound' | 'disabled' | 'noTargets' | 'noActiveShift' | 'notAssigned';

// Run a quick log: resolve targets, delegate to logDailyEvent, then apply the
// remember rule. companionIds omitted (API path) → the resolved prefill set.
// rememberSelection omitted (API path) → the stored memory is never touched.
export async function executeQuickLog(opts: {
	user: { id: string; role: UserRole };
	quickLogId: string;
	companionIds?: string[];
	loggedAt?: Date;
	rememberSelection?: boolean;
}): Promise<{ ok: true; ids: string[] } | { ok: false; code: ExecuteQuickLogError }> {
	const quickLog = await db.query.quickLogs.findFirst({
		where: and(eq(schema.quickLogs.id, opts.quickLogId), eq(schema.quickLogs.userId, opts.user.id)),
		with: { companions: { columns: { companionId: true } } }
	});
	if (!quickLog) return { ok: false, code: 'notFound' };
	if (!quickLog.isEnabled) return { ok: false, code: 'disabled' };

	const assigned = new Set(quickLog.companions.map((c) => c.companionId));
	let targets: string[];
	if (opts.companionIds && opts.companionIds.length > 0) {
		targets = opts.companionIds.filter((id) => assigned.has(id));
	} else {
		const allowed = new Set(await listAllowedCompanions(opts.user));
		const assignedAllowed = [...assigned].filter((id) => allowed.has(id));
		const remembered = parseLastCompanionIds(quickLog.lastCompanionIds).filter((id) =>
			assignedAllowed.includes(id)
		);
		targets = remembered.length > 0 ? remembered : assignedAllowed;
	}
	if (targets.length === 0) return { ok: false, code: 'noTargets' };

	const result = await logDailyEvent(opts.user, targets, {
		type: quickLog.type,
		notes: quickLog.note,
		durationMinutes: quickLog.durationMinutes,
		subtypes: quickLog.subtypes,
		loggedAt: opts.loggedAt ?? new Date()
	});
	if (!result.ok) return result;

	if (opts.rememberSelection !== undefined) {
		await db
			.update(schema.quickLogs)
			.set(
				opts.rememberSelection
					? { rememberAlso: true, lastCompanionIds: JSON.stringify(targets) }
					: { rememberAlso: false }
			)
			.where(eq(schema.quickLogs.id, quickLog.id));
	}

	return { ok: true, ids: result.ids };
}
