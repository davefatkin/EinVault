import { beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
	goto: vi.fn(async () => {}),
	refreshAll: vi.fn(async () => {}),
	applyAction: vi.fn(async () => {}),
	applyAttachments: vi.fn(),
	url: new URL('http://x/c1/health')
}));

vi.mock('$app/navigation', () => ({ goto: nav.goto, refreshAll: nav.refreshAll }));
vi.mock('$app/forms', () => ({ applyAction: nav.applyAction }));
vi.mock('$app/state', () => ({
	page: {
		get url() {
			return nav.url;
		}
	}
}));
vi.mock('#lib/healthAttachments.js', async (orig) => ({
	...(await orig<typeof import('#lib/healthAttachments.js')>()),
	applyAttachments: nav.applyAttachments
}));

import { createHealthEventSave } from './healthEventSave.svelte.js';

type Result =
	| { type: 'success'; status: number; data?: Record<string, unknown> }
	| { type: 'failure'; status: number; data?: Record<string, unknown> }
	| { type: 'redirect'; status: number; location: string }
	| { type: 'error'; status?: number; error: unknown };

function setup(over: Partial<Parameters<typeof createHealthEventSave>[0]> = {}) {
	const onclose = vi.fn();
	const save = createHealthEventSave({
		companionId: () => 'c1',
		titles: () => ({ d1: 'Doc one' }),
		locale: () => 'en',
		onclose,
		...over
	});
	return { save, onclose };
}

// Runs the SubmitFunction and its result callback the way use:enhance does.
async function submit(
	save: ReturnType<typeof createHealthEventSave>,
	result: Result,
	before?: () => void
) {
	const cancel = vi.fn();
	const after = await save.submit({ cancel } as never);
	if (cancel.mock.calls.length > 0 || typeof after !== 'function') return { cancel };
	before?.();
	await after({ result, update: vi.fn() } as never);
	return { cancel };
}

const saved = { healthEventId: 'h1', day: '2026-05-01', reminderUrl: null };

beforeEach(() => {
	vi.clearAllMocks();
	nav.url = new URL('http://x/c1/health');
	nav.applyAttachments.mockResolvedValue([]);
});

describe('createHealthEventSave', () => {
	it('applies pending changes to the saved event, refreshes and closes', async () => {
		const { save, onclose } = setup();
		save.pending = { ...save.pending, linkIds: ['d1'] };
		await submit(save, { type: 'success', status: 200, data: saved });
		expect(nav.applyAttachments).toHaveBeenCalledWith(
			expect.objectContaining({
				companionId: 'c1',
				healthEventId: 'h1',
				day: '2026-05-01',
				titles: { d1: 'Doc one' },
				locale: 'en',
				pending: expect.objectContaining({ linkIds: ['d1'] })
			})
		);
		expect(nav.refreshAll).toHaveBeenCalled();
		expect(onclose).toHaveBeenCalledOnce();
		expect(save.phase).toBe('form');
		expect(nav.goto).not.toHaveBeenCalled();
	});

	it('goes to the reminder URL after a clean save', async () => {
		const { save } = setup();
		await submit(save, {
			type: 'success',
			status: 200,
			data: { ...saved, reminderUrl: '/c1/reminders?new=1' }
		});
		expect(nav.goto).toHaveBeenCalledWith('/c1/reminders?new=1');
	});

	it('lists failures and keeps the reminder URL for the panel', async () => {
		nav.applyAttachments.mockResolvedValue([{ name: 'a.txt', message: 'Invalid file type' }]);
		const { save, onclose } = setup();
		await submit(save, {
			type: 'success',
			status: 200,
			data: { ...saved, reminderUrl: '/c1/reminders?new=1' }
		});
		expect(save.phase).toBe('failed');
		expect(save.failures).toEqual([{ name: 'a.txt', message: 'Invalid file type' }]);
		expect(save.reminderUrl).toBe('/c1/reminders?new=1');
		expect(onclose).not.toHaveBeenCalled();
		expect(nav.goto).not.toHaveBeenCalled();
	});

	it('keeps the form and its picks on a failed save', async () => {
		const { save, onclose } = setup();
		const file = new File(['x'], 'a.pdf');
		save.pending = { ...save.pending, files: [file] };
		await submit(save, { type: 'failure', status: 400, data: { healthError: 'Title needed' } });
		expect(save.phase).toBe('form');
		expect(save.error).toBe('Title needed');
		expect(save.pending.files).toEqual([file]);
		expect(onclose).not.toHaveBeenCalled();
		expect(nav.applyAttachments).not.toHaveBeenCalled();
	});

	it('shows a generic error for an error result', async () => {
		const { save } = setup();
		await submit(save, { type: 'error', error: new Error('boom') });
		expect(save.phase).toBe('form');
		expect(save.error).toBeTruthy();
	});

	it('follows a redirect result after closing', async () => {
		const { save, onclose } = setup();
		const result = { type: 'redirect' as const, status: 303, location: '/c1/health' };
		await submit(save, result);
		expect(onclose).toHaveBeenCalledOnce();
		expect(nav.applyAction).toHaveBeenCalledWith(result);
		expect(save.phase).toBe('form');
	});

	it('cancels a second submit while saving', async () => {
		const { save } = setup();
		await save.submit({ cancel: vi.fn() } as never);
		expect(save.phase).toBe('saving');
		const { cancel } = await submit(save, { type: 'success', status: 200, data: saved });
		expect(cancel).toHaveBeenCalled();
	});

	it('cancels and shows an error when the before hook throws', async () => {
		const { save } = setup({
			before: async () => {
				throw new Error('flush failed');
			}
		});
		const { cancel } = await submit(save, { type: 'success', status: 200, data: saved });
		expect(cancel).toHaveBeenCalled();
		expect(save.phase).toBe('form');
		expect(save.error).toBeTruthy();
	});

	it('leaves a page the user has left alone', async () => {
		nav.applyAttachments.mockResolvedValue([{ name: 'a.txt', message: 'bad' }]);
		const { save, onclose } = setup();
		save.pending = { ...save.pending, linkIds: ['d1'] };
		await submit(
			save,
			{ type: 'success', status: 200, data: { ...saved, reminderUrl: '/r' } },
			() => {
				nav.url = new URL('http://x/c2/health');
			}
		);
		expect(save.phase).toBe('form');
		expect(save.failures).toEqual([]);
		expect(save.pending.linkIds).toEqual([]);
		expect(onclose).not.toHaveBeenCalled();
		expect(nav.goto).not.toHaveBeenCalled();
	});

	it('reads the saved event through readSaved', async () => {
		const { save } = setup({
			readSaved: (data) => ({ healthEventId: 'e9', day: String(data.day), reminderUrl: null })
		});
		await submit(save, {
			type: 'success',
			status: 200,
			data: { updateHealthSuccess: true, day: '2026-01-02' }
		});
		expect(nav.applyAttachments).toHaveBeenCalledWith(
			expect.objectContaining({ healthEventId: 'e9', day: '2026-01-02' })
		);
	});

	it('reset empties pending, failures and the error', async () => {
		nav.applyAttachments.mockResolvedValue([{ name: 'a.txt', message: 'bad' }]);
		const { save } = setup();
		save.pending = { ...save.pending, linkIds: ['d1'] };
		await submit(save, { type: 'success', status: 200, data: saved });
		save.reset();
		expect(save.phase).toBe('form');
		expect(save.failures).toEqual([]);
		expect(save.pending.linkIds).toEqual([]);
		expect(save.reminderUrl).toBeNull();
	});
});
