import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-biscuit';

test('companion dashboard renders hero and cards @mobile', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await expect(asMember.getByRole('heading', { name: /Biscuit/i })).toBeVisible({ timeout: 8_000 });
	await expect(asMember.getByText(/upcoming reminders/i)).toBeVisible({ timeout: 8_000 });
});
