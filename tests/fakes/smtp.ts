import { SMTPServer } from 'smtp-server';
import { simpleParser, type ParsedMail } from 'mailparser';
import type { Fake } from './types';

export interface SmtpSink extends Fake {
	port: number;
	messages: ParsedMail[];
	/** Resolves when a captured mail matches; rejects after timeoutMs. */
	waitForMail(match: (m: ParsedMail) => boolean, timeoutMs?: number): Promise<ParsedMail>;
}

export async function startSmtpSink(): Promise<SmtpSink> {
	const messages: ParsedMail[] = [];
	const waiters: Array<{ match: (m: ParsedMail) => boolean; resolve: (m: ParsedMail) => void }> =
		[];

	const server = new SMTPServer({
		authOptional: true,
		disabledCommands: ['STARTTLS'],
		onData(stream, _session, callback) {
			simpleParser(stream)
				.then((mail) => {
					messages.push(mail);
					for (let i = waiters.length - 1; i >= 0; i--) {
						if (waiters[i].match(mail)) {
							waiters[i].resolve(mail);
							waiters.splice(i, 1);
						}
					}
					callback();
				})
				.catch((err) => callback(err as Error));
		}
	});

	const port = await new Promise<number>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => {
			const addr = server.server.address();
			if (addr && typeof addr === 'object') resolve(addr.port);
			else reject(new Error('smtp sink: no port'));
		});
	});

	return {
		url: `smtp://127.0.0.1:${port}`,
		port,
		messages,
		waitForMail(match, timeoutMs = 15_000) {
			const existing = messages.find(match);
			if (existing) return Promise.resolve(existing);
			return new Promise((resolve, reject) => {
				const timer = setTimeout(
					() => reject(new Error('smtp sink: timed out waiting for mail')),
					timeoutMs
				);
				waiters.push({
					match,
					resolve: (m) => {
						clearTimeout(timer);
						resolve(m);
					}
				});
			});
		},
		reset() {
			messages.length = 0;
			// Abandon pending waiters; their callers own the timeout rejection.
			waiters.length = 0;
		},
		stop: () => new Promise((resolve) => server.close(() => resolve()))
	};
}
