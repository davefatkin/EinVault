import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';
import { generateId } from '$lib/server/utils';

export async function dismissReminder(
	reminder: typeof schema.reminders.$inferSelect
): Promise<void> {
	await db
		.update(schema.reminders)
		.set({ isDismissed: true })
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
			recurringDays: reminder.recurringDays
		});
	}
}
