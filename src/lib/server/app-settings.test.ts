import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { getAppSettings, setRequire2fa, setCurrency } from './app-settings';

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

	it('defaults currency to USD and persists a change', async () => {
		expect((await getAppSettings()).currency).toBe('USD');
		await setCurrency('EUR', 'some-admin-id');
		expect((await getAppSettings()).currency).toBe('EUR');
		await setRequire2fa('off', 'some-admin-id');
		expect((await getAppSettings()).currency).toBe('EUR');
	});
});
