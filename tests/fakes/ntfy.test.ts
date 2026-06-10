import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startNtfyFake, type NtfyFake } from './ntfy';

describe('ntfy fake', () => {
	let fake: NtfyFake;
	beforeAll(async () => {
		fake = await startNtfyFake();
	});
	afterAll(async () => {
		await fake.stop();
	});

	it('records a publish with auth header and resolves waiters', async () => {
		const waiting = fake.waitForPublish((p) => p.topic === 'topic-a', 5000);
		const res = await fetch(fake.url, {
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Bearer tok-1' },
			body: JSON.stringify({ topic: 'topic-a', title: 'T', message: 'M', click: 'http://x' })
		});
		expect(res.ok).toBe(true);
		const pub = await waiting;
		expect(pub).toMatchObject({
			topic: 'topic-a',
			title: 'T',
			message: 'M',
			click: 'http://x',
			authorization: 'Bearer tok-1'
		});
	});

	it('rejects non-POST and malformed bodies', async () => {
		expect((await fetch(fake.url)).status).toBe(405);
		expect((await fetch(fake.url, { method: 'POST', body: 'not json' })).status).toBe(400);
	});

	it('reset clears recorded publishes', async () => {
		fake.reset();
		expect(fake.publishes).toHaveLength(0);
	});
});
