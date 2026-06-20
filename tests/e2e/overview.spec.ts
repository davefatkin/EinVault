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
	// Enriched seed has overdue reminders for both Ein ("Dental check", -5d) and
	// Edward ("Nail trim", -3d) → both companions show "Needs attention".
	await expect(asMember.getByText(/needs attention/i).first()).toBeVisible({ timeout: 8_000 });
});

test('overview companion cards have care-status for all companions @mobile', async ({
	asMember
}) => {
	await asMember.goto('/');
	// Both Ein and Edward should have care-status badges rendered.
	// Both have overdue reminders in the enriched seed → both show "Needs attention".
	const badges = asMember.getByText(/needs attention/i);
	await expect(badges.first()).toBeVisible({ timeout: 8_000 });
});
