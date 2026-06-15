import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { getAppSettings, setRequire2fa } from './app-settings';

beforeAll(async () => {
	await db
		.insert(schema.users)
		.values({ id: 'some-admin-id', username: 'admin', displayName: 'Admin', role: 'admin' });
});

describe('app-settings', () => {
	it('defaults require2fa to off and persists a change', async () => {
		expect((await getAppSettings()).require2fa).toBe('off');
		await setRequire2fa('everyone', 'some-admin-id');
		expect((await getAppSettings()).require2fa).toBe('everyone');
	});
});
