import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import nodemailer from 'nodemailer';
import { startSmtpSink, type SmtpSink } from './smtp';

function sendMail(port: number, from: string, to: string, body: string): Promise<void> {
	const transport = nodemailer.createTransport({
		host: '127.0.0.1',
		port,
		secure: false,
		tls: { rejectUnauthorized: false }
	});
	return transport
		.sendMail({ from, to, subject: 'hello', text: body })
		.then(() => transport.close());
}

describe('smtp sink', () => {
	let sink: SmtpSink;
	beforeAll(async () => {
		sink = await startSmtpSink();
	});
	afterAll(async () => {
		await sink.stop();
	});

	it('captures a delivered mail and resolves waitForMail', async () => {
		const waiting = sink.waitForMail((m) => (m.text ?? '').includes('ping-1'), 5000);
		await sendMail(sink.port, 'a@example.com', 'b@example.com', 'ping-1');
		const mail = await waiting;
		expect(mail.subject).toBe('hello');
		expect(sink.messages.length).toBeGreaterThan(0);
	});

	it('reset clears messages and pending waiters', async () => {
		// Clear state from previous test so the orphan waiter cannot fast-path
		// against already-captured messages.
		sink.reset();
		const orphan = sink.waitForMail(() => true, 500);
		sink.reset();
		expect(sink.messages).toHaveLength(0);
		// Orphaned waiter must reject on its own timeout, not resolve on later mail.
		await sendMail(sink.port, 'a@example.com', 'b@example.com', 'ping-2');
		await expect(orphan).rejects.toThrow(/timed out/);
	});
});
