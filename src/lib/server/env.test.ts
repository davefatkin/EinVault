import { describe, it, expect, vi } from 'vitest';

// $env/dynamic/private snapshots process.env at module import. env.ts then bakes
// its exported consts (DEMO_MODE, etc.) at evaluation time. Use a live proxy plus
// vi.resetModules() so each test re-evaluates env.ts against the process.env it
// sets, independent of import order / pollution from other test files.
vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_, key: string) => process.env[key]
	})
}));

describe('calendar feed env', () => {
	it('exports a default 90-day history and enabled flag', async () => {
		vi.resetModules();
		const env = await import('./env');
		expect(env.CALENDAR_FEED_HISTORY_DAYS).toBe(90);
		expect(env.CALENDAR_FEED_ENABLED).toBe(true);
	});
});

describe('demo mode env', () => {
	it('defaults DEMO_MODE to false', async () => {
		delete process.env.DEMO_MODE;
		vi.resetModules();
		const env = await import('./env');
		expect(env.DEMO_MODE).toBe(false);
	});

	it('reads DEMO_MODE=true from the environment', async () => {
		process.env.DEMO_MODE = 'true';
		vi.resetModules();
		try {
			const env = await import('./env');
			expect(env.DEMO_MODE).toBe(true);
		} finally {
			delete process.env.DEMO_MODE;
		}
	});
});
