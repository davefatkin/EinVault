import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '#lib/server/db/index.js';

vi.mock('#lib/server/mail/index.js', () => ({
	isMailEnabled: () => true,
	sendMail: vi.fn(async () => {})
}));
vi.mock('./ntfy', () => ({
	isNtfyEnabled: () => true,
	sendNtfy: vi.fn(async () => {})
}));

const { sendMail } = await import('#lib/server/mail/index.js');
const { sendNtfy } = await import('./ntfy');
const { deliverIncident, deliverIncidentNtfy, enqueueIncidentAlert, incidentDedupeKey } =
	await import('./incidents');
type Row = Parameters<typeof deliverIncident>[0];

const COMP = 'comp-n';
const INC = 'inc-n';
const UPD = 'upd-n';
const BODY = 'Limping worse, wound looks red';

const user = (
	id: string,
	over: Partial<typeof schema.users.$inferInsert> = {}
): typeof schema.users.$inferInsert =>
	({
		id,
		username: id,
		displayName: id,
		role: 'member',
		email: `${id}@example.com`,
		ntfyTopic: `${id}-topic`,
		...over
	}) as typeof schema.users.$inferInsert;

const rows = () => db.select().from(schema.notificationOutbox);
const claimed = (userId: string, channel: 'email' | 'ntfy'): Row =>
	({ id: 'r1', userId, channel }) as Row;

beforeEach(async () => {
	vi.clearAllMocks();
	await db.delete(schema.notificationOutbox);
	await db.delete(schema.healthEvents);
	await db.delete(schema.companions);
	await db.delete(schema.users);
	await db
		.insert(schema.users)
		.values([
			user('actor', { role: 'admin' }),
			user('owner'),
			user('quiet', { notifyIncidentEmail: false }),
			user('nomail', { email: null, ntfyTopic: null }),
			user('away', { isActive: false }),
			user('care', { role: 'caretaker' })
		]);
	await db.insert(schema.companions).values({ id: COMP, name: 'Ein' } as never);
	await db.insert(schema.healthEvents).values({
		id: INC,
		companionId: COMP,
		type: 'incident',
		title: 'Sore paw',
		severity: 'moderate',
		notes: 'Found limping',
		occurredAt: new Date()
	} as never);
	await db.insert(schema.healthEventUpdates).values({
		id: UPD,
		healthEventId: INC,
		body: BODY,
		severity: 'severe',
		occurredAt: new Date()
	});
});

describe('enqueueIncidentAlert', () => {
	it('uses the documented dedupe key', () => {
		expect(incidentDedupeKey('updated', 'u1', 'x', 'ntfy')).toBe('incident:updated:u1:x:ntfy');
	});

	it('enqueues email and ntfy for owners, skipping the actor, caretakers and inactive users', async () => {
		const n = await enqueueIncidentAlert({ kind: 'incidentLogged', incidentId: INC }, 'actor');
		const all = await rows();
		expect(n).toBe(all.length);
		const keys = all.map((r) => `${r.userId}:${r.channel}`).sort();
		// 'quiet' opted out of email only; 'nomail' has neither channel.
		expect(keys).toEqual(['owner:email', 'owner:ntfy', 'quiet:ntfy']);
		expect(all.every((r) => r.payload.kind === 'incidentLogged')).toBe(true);
	});

	it('is idempotent per update', async () => {
		const ev = { kind: 'incidentUpdated' as const, incidentId: INC, updateId: UPD };
		await enqueueIncidentAlert(ev, 'actor');
		expect(await enqueueIncidentAlert(ev, 'actor')).toBe(0);
		expect((await rows()).length).toBe(3);
	});
});

describe('deliverIncident', () => {
	const updated = { kind: 'incidentUpdated' as const, incidentId: INC, updateId: UPD };

	it('emails the update body with the current severity', async () => {
		await deliverIncident(claimed('owner', 'email'), updated);
		const msg = vi.mocked(sendMail).mock.calls[0][0];
		expect(msg.to).toBe('owner@example.com');
		expect(msg.subject).toContain('Sore paw');
		expect(msg.text).toContain(BODY);
		expect(msg.text).toContain('Ein');
		expect(msg.text).toContain('Severe');
	});

	it('shows the incident notes for a logged incident', async () => {
		await deliverIncident(claimed('owner', 'email'), { kind: 'incidentLogged', incidentId: INC });
		expect(vi.mocked(sendMail).mock.calls[0][0].text).toContain('Found limping');
	});

	it('skips when the update was deleted', async () => {
		await db.delete(schema.healthEventUpdates).where(eq(schema.healthEventUpdates.id, UPD));
		await deliverIncident(claimed('owner', 'email'), updated);
		await deliverIncidentNtfy(claimed('owner', 'ntfy'), updated);
		expect(sendMail).not.toHaveBeenCalled();
		expect(sendNtfy).not.toHaveBeenCalled();
	});

	it('skips an archived companion, a demoted recipient, and an opt-out', async () => {
		await db.update(schema.users).set({ role: 'caretaker' }).where(eq(schema.users.id, 'owner'));
		await deliverIncident(claimed('owner', 'email'), updated);
		await deliverIncident(claimed('quiet', 'email'), updated);
		await db.update(schema.companions).set({ isActive: false });
		await deliverIncident(claimed('away', 'email'), updated);
		expect(sendMail).not.toHaveBeenCalled();
		await db.update(schema.users).set({ role: 'member' }).where(eq(schema.users.id, 'owner'));
		await deliverIncident(claimed('owner', 'email'), updated);
		expect(sendMail).not.toHaveBeenCalled();
	});
});

describe('deliverIncidentNtfy', () => {
	it('carries title and severity but not the update text', async () => {
		await deliverIncidentNtfy(claimed('owner', 'ntfy'), {
			kind: 'incidentUpdated',
			incidentId: INC,
			updateId: UPD
		});
		const [topic, msg] = vi.mocked(sendNtfy).mock.calls[0];
		expect(topic).toBe('owner-topic');
		expect(msg.title).toContain('Sore paw');
		expect(msg.message).toContain('Severe');
		expect(msg.message).not.toContain(BODY);
		expect(msg.message).not.toContain('Limping');
	});
});
