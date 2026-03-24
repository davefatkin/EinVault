import { db, schema } from '$lib/server/db';
import { and, eq, gte, lte, gt } from 'drizzle-orm';

export async function getUpcomingShifts(userId: string) {
	const now = new Date();
	return db.query.caretakerShifts.findMany({
		where: and(eq(schema.caretakerShifts.userId, userId), gte(schema.caretakerShifts.endAt, now)),
		orderBy: (s, { asc }) => [asc(s.startAt)],
		limit: 20
	});
}

export async function getShiftStatus(userId: string) {
	const now = new Date();

	const [activeShift = null] = await db.query.caretakerShifts.findMany({
		where: and(
			eq(schema.caretakerShifts.userId, userId),
			lte(schema.caretakerShifts.startAt, now),
			gte(schema.caretakerShifts.endAt, now)
		),
		limit: 1
	});

	const [nextShift = null] = await db.query.caretakerShifts.findMany({
		where: and(eq(schema.caretakerShifts.userId, userId), gt(schema.caretakerShifts.startAt, now)),
		orderBy: (s, { asc }) => [asc(s.startAt)],
		limit: 1
	});

	return { isOnShift: activeShift !== null, activeShift, nextShift };
}
