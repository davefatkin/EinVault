import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';

export async function completeReminder(
	reminder: typeof schema.reminders.$inferSelect,
	userId: string
): Promise<void> {
	await db
		.update(schema.reminders)
		.set({ completedAt: new Date(), completedBy: userId })
		.where(eq(schema.reminders.id, reminder.id));

	if (reminder.isRecurring && reminder.recurringDays && reminder.recurringDays > 0) {
		const nextDueAt = new Date(reminder.dueAt);
		nextDueAt.setDate(nextDueAt.getDate() + reminder.recurringDays);
		await db.insert(schema.reminders).values({
			id: generateId(15),
			companionId: reminder.companionId,
			title: reminder.title,
			description: reminder.description,
			type: reminder.type,
			dueAt: nextDueAt,
			isRecurring: true,
			recurringDays: reminder.recurringDays,
			seriesId: reminder.seriesId ?? reminder.id,
			loggedBy: reminder.loggedBy
		});
	}
}
