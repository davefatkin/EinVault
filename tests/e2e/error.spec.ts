import { test, expect } from '../lib/fixtures';

test('404 route shows the confused Ein', async ({ asAdmin }) => {
	const res = await asAdmin.goto('/this-route-does-not-exist');
	expect(res!.status()).toBe(404);
	const ein = asAdmin.getByTestId('ein');
	await expect(ein).toBeVisible({ timeout: 8_000 });
	await expect(ein).toHaveAttribute('data-pose', 'confused');
});
