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

	it('forces the Bearer-token API off in demo mode, even if API_TOKENS_ENABLED=true', async () => {
		process.env.DEMO_MODE = 'true';
		process.env.API_TOKENS_ENABLED = 'true';
		vi.resetModules();
		try {
			const env = await import('./env');
			expect(env.API_TOKENS_ENABLED).toBe(false);
		} finally {
			delete process.env.DEMO_MODE;
			delete process.env.API_TOKENS_ENABLED;
		}
	});

	it('leaves the API enabled by default outside demo mode', async () => {
		delete process.env.DEMO_MODE;
		delete process.env.API_TOKENS_ENABLED;
		vi.resetModules();
		const env = await import('./env');
		expect(env.API_TOKENS_ENABLED).toBe(true);
	});
});

describe('note media cap env', () => {
	it('defaults MAX_NOTE_MEDIA to 10', async () => {
		delete process.env.MAX_NOTE_MEDIA;
		vi.resetModules();
		const env = await import('./env');
		expect(env.MAX_NOTE_MEDIA).toBe(10);
	});

	it('reads MAX_NOTE_MEDIA and ignores non-positive values', async () => {
		process.env.MAX_NOTE_MEDIA = '3';
		vi.resetModules();
		try {
			expect((await import('./env')).MAX_NOTE_MEDIA).toBe(3);
			process.env.MAX_NOTE_MEDIA = '0';
			vi.resetModules();
			expect((await import('./env')).MAX_NOTE_MEDIA).toBe(10);
		} finally {
			delete process.env.MAX_NOTE_MEDIA;
		}
	});
});
