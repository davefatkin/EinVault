import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-biscuit';

test('companion dashboard renders hero and cards @mobile', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await expect(asMember.getByRole('heading', { name: /Biscuit/i })).toBeVisible({ timeout: 8_000 });
	await expect(asMember.getByText(/upcoming reminders/i)).toBeVisible({ timeout: 8_000 });
});

// Regression: the mobile quick-add FAB's "Add journal entry" must point at
// today's journal day (YYYY-MM-DD), not /journal/new (which 400s on date parse).
test('mobile quick-add journal links to today, not /new @mobile', async ({
	asMember
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'FAB is mobile-only');
	await asMember.goto(`/${COMP}`);
	await asMember.getByRole('button', { name: 'Quick add' }).click();
	const link = asMember.getByRole('link', { name: 'Add journal entry' });
	await expect(link).toHaveAttribute('href', new RegExp(`/${COMP}/journal/\\d{4}-\\d{2}-\\d{2}$`));
	// Following it loads a real journal day (not a 400).
	await link.click();
	await expect(asMember).toHaveURL(new RegExp(`/${COMP}/journal/\\d{4}-\\d{2}-\\d{2}$`), {
		timeout: 8_000
	});
	await expect(asMember.locator('textarea').first()).toBeVisible({ timeout: 8_000 });
});
