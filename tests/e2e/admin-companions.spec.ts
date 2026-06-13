import { test, expect } from '../lib/fixtures';

test.describe('admin-companions', () => {
	test('admin sees companion list with Biscuit and edit link', async ({ asAdmin }) => {
		await asAdmin.goto('/admin/companions');
		await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 10_000 });

		const main = asAdmin.locator('main, [role="main"], .max-w-3xl').first();
		await expect(main.getByText('Biscuit')).toBeVisible();
		await expect(
			asAdmin.locator('a[href="/companions/seed-comp-biscuit/edit"]').first()
		).toBeVisible();
	});

	test('member gets 403 on admin/companions', async ({ asMember }) => {
		const res = await asMember.request.get('/admin/companions');
		expect(res.status()).toBe(403);
	});

	test('sub-nav switches to users', async ({ asAdmin }) => {
		await asAdmin.goto('/admin/companions');
		await expect(asAdmin).toHaveURL(/\/admin\/companions/, { timeout: 10_000 });
		await asAdmin
			.getByRole('navigation', { name: /admin sections/i })
			.getByRole('link', { name: /users/i })
			.click();
		await expect(asAdmin).toHaveURL(/\/admin\/users/, { timeout: 10_000 });
	});
});
