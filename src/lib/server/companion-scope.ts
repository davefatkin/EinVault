import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { getShiftStatus } from '$lib/server/shifts';
import type { UserRole } from '$lib/server/validation';
import type { CareErrorCode } from '$lib/server/care-errors';

// The canonical companion-authorization layer. Every companion-scoped feature
// (quick logs, daily events, journal, and future models) resolves "which
// companions may this user act on" through here, so the caretaker
// shift/assignment rules live in exactly one place.

// READ scope — companions a user may target, no shift gate. Members/admins get
// all active companions; caretakers get their assigned active companions.
export async function listAllowedCompanions(user: {
	id: string;
	role: UserRole;
}): Promise<string[]> {
	if (user.role === 'caretaker') {
		const assigned = await db.query.companionCaretakers.findMany({
			where: eq(schema.companionCaretakers.userId, user.id),
			columns: { companionId: true }
		});
		if (assigned.length === 0) return [];
		const active = await db.query.companions.findMany({
			where: and(
				inArray(
					schema.companions.id,
					assigned.map((r) => r.companionId)
				),
				eq(schema.companions.isActive, true)
			),
			columns: { id: true }
		});
		return active.map((c) => c.id);
	}
	const active = await db.query.companions.findMany({
		where: eq(schema.companions.isActive, true),
		columns: { id: true }
	});
	return active.map((c) => c.id);
}

export type AuthorizeResult = { ok: true; ids: string[] } | { ok: false; code: CareErrorCode };

// WRITE scope — given requested companion ids, return the authorized subset or
// a typed CareErrorCode. Caretakers must be on shift and every id must be an
// assigned active companion; unassigned/archived ids are dropped, but an empty
// result is an error so a bad primary target can't silently no-op. Unknown and
// unassigned ids both yield `notAssigned` (no enumeration oracle).
export async function authorizeCompanions(
	user: { id: string; role: UserRole },
	companionIds: string[]
): Promise<AuthorizeResult> {
	const requested = [...new Set(companionIds.filter(Boolean))];
	if (requested.length === 0) return { ok: false, code: 'noTargets' };

	if (user.role === 'caretaker') {
		const { isOnShift } = await getShiftStatus(user.id);
		if (!isOnShift) return { ok: false, code: 'noActiveShift' };

		const assignedRows = await db.query.companionCaretakers.findMany({
			where: and(
				eq(schema.companionCaretakers.userId, user.id),
				inArray(schema.companionCaretakers.companionId, requested)
			),
			columns: { companionId: true }
		});
		const assignedIds = assignedRows.map((r) => r.companionId);
		if (assignedIds.length === 0) return { ok: false, code: 'notAssigned' };

		const activeRows = await db.query.companions.findMany({
			where: and(inArray(schema.companions.id, assignedIds), eq(schema.companions.isActive, true)),
			columns: { id: true }
		});
		const ids = activeRows.map((r) => r.id);
		return ids.length > 0 ? { ok: true, ids } : { ok: false, code: 'notAssigned' };
	}

	const activeRows = await db.query.companions.findMany({
		where: and(inArray(schema.companions.id, requested), eq(schema.companions.isActive, true)),
		columns: { id: true }
	});
	const ids = activeRows.map((r) => r.id);
	return ids.length > 0 ? { ok: true, ids } : { ok: false, code: 'noTargets' };
}
