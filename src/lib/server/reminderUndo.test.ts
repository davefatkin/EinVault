import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: new Proxy({} as Record<string, string | undefined>, {
		get: (_, key: string) => process.env[key]
	})
}));

async function loadEnvModule() {
	vi.resetModules();
	return await import('$lib/server/env');
}

describe('reminder undo resolution', () => {
	beforeEach(() => {
		delete process.env.REMINDER_UNDO_SECONDS;
	});

	it('defaults to 7 when unset', async () => {
		const mod = await loadEnvModule();
		expect(mod.REMINDER_UNDO_SECONDS_DEFAULT).toBe(7);
	});

	it('honors the env override and clamps it to the max', async () => {
		process.env.REMINDER_UNDO_SECONDS = '15';
		expect((await loadEnvModule()).REMINDER_UNDO_SECONDS_DEFAULT).toBe(15);

		process.env.REMINDER_UNDO_SECONDS = '999';
		expect((await loadEnvModule()).REMINDER_UNDO_SECONDS_DEFAULT).toBe(60);
	});

	it('falls back to default for junk env values', async () => {
		process.env.REMINDER_UNDO_SECONDS = 'banana';
		expect((await loadEnvModule()).REMINDER_UNDO_SECONDS_DEFAULT).toBe(7);

		process.env.REMINDER_UNDO_SECONDS = '-3';
		expect((await loadEnvModule()).REMINDER_UNDO_SECONDS_DEFAULT).toBe(7);
	});

	it('resolveReminderUndoSeconds prefers a valid user pref, clamped', async () => {
		const mod = await loadEnvModule();
		expect(mod.resolveReminderUndoSeconds(3)).toBe(3);
		expect(mod.resolveReminderUndoSeconds(0)).toBe(0);
		expect(mod.resolveReminderUndoSeconds(999)).toBe(60);
	});

	it('resolveReminderUndoSeconds falls back to the site default for null/undefined/invalid', async () => {
		process.env.REMINDER_UNDO_SECONDS = '12';
		const mod = await loadEnvModule();
		expect(mod.resolveReminderUndoSeconds(null)).toBe(12);
		expect(mod.resolveReminderUndoSeconds(undefined)).toBe(12);
		expect(mod.resolveReminderUndoSeconds(2.5)).toBe(12);
		expect(mod.resolveReminderUndoSeconds(-1)).toBe(12);
	});
});
