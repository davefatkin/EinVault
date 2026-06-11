import { describe, it, expect } from 'vitest';

describe('calendar feed env', () => {
	it('exports a default 90-day history and enabled flag', async () => {
		const env = await import('./env');
		expect(env.CALENDAR_FEED_HISTORY_DAYS).toBe(90);
		expect(env.CALENDAR_FEED_ENABLED).toBe(true);
	});
});
