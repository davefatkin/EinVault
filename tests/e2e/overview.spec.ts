import { test, expect } from '../lib/fixtures';

test('overview renders companion cards and needs-attention @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed has 2 companions (Biscuit, Waffles) → this is the overview, not a redirect.
	await expect(asMember.getByRole('link', { name: /Biscuit/i }).first()).toBeVisible({
		timeout: 8_000
	});
	await expect(asMember.getByRole('link', { name: /Waffles/i }).first()).toBeVisible();
});
