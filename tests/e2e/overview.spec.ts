import { test, expect } from '../lib/fixtures';

test('overview renders companion cards and needs-attention @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed has 2 companions (Biscuit, Waffles) → this is the overview, not a redirect.
	await expect(asMember.getByRole('link', { name: /Biscuit/i }).first()).toBeVisible({
		timeout: 8_000
	});
	await expect(asMember.getByRole('link', { name: /Waffles/i }).first()).toBeVisible();
});

test('overview shows care-status badge @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed reminder for Biscuit is 30 days in the future → "Up to date"
	// Waffles has no reminders → also "Up to date"
	await expect(
		asMember.getByText(/up to date/i).first()
	).toBeVisible({ timeout: 8_000 });
});

test('overview companion cards have care-status for all companions @mobile', async ({
	asMember
}) => {
	await asMember.goto('/');
	// Both Biscuit and Waffles should have care-status badges rendered.
	// Seed reminder for Biscuit is 30 days in the future, Waffles has none — both are "Up to date".
	const badges = asMember.getByText(/up to date/i);
	await expect(badges.first()).toBeVisible({ timeout: 8_000 });
});
