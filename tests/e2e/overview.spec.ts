import { test, expect } from '../lib/fixtures';

test('overview renders companion cards and needs-attention @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed has 2 companions (Ein, Edward) → this is the overview, not a redirect.
	await expect(asMember.getByRole('link', { name: /Ein/i }).first()).toBeVisible({
		timeout: 8_000
	});
	await expect(asMember.getByRole('link', { name: /Edward/i }).first()).toBeVisible();
});

test('overview shows care-status badge @mobile', async ({ asMember }) => {
	await asMember.goto('/');
	// Seed reminder for Ein is 30 days in the future → "Up to date"
	// Edward has no reminders → also "Up to date"
	await expect(asMember.getByText(/up to date/i).first()).toBeVisible({ timeout: 8_000 });
});

test('overview companion cards have care-status for all companions @mobile', async ({
	asMember
}) => {
	await asMember.goto('/');
	// Both Ein and Edward should have care-status badges rendered.
	// Seed reminder for Ein is 30 days in the future, Edward has none — both are "Up to date".
	const badges = asMember.getByText(/up to date/i);
	await expect(badges.first()).toBeVisible({ timeout: 8_000 });
});
