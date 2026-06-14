import { test, expect } from '../lib/fixtures';

const COMP = 'seed-comp-ein';

test('companion dashboard renders hero and cards @mobile', async ({ asMember }) => {
	await asMember.goto(`/${COMP}`);
	await expect(asMember.getByRole('heading', { name: /Ein/i })).toBeVisible({ timeout: 8_000 });
	await expect(asMember.getByText(/upcoming reminders/i)).toBeVisible({ timeout: 8_000 });
});

test('mobile FAB deep-link hrefs @mobile', async ({ asMember }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'FAB is mobile-only');
	await asMember.goto(`/${COMP}`);
	await asMember.getByRole('button', { name: 'Quick add' }).click();
	await expect(asMember.getByRole('link', { name: 'Add reminder' })).toHaveAttribute(
		'href',
		`/${COMP}/reminders?new=1`
	);
	await expect(asMember.getByRole('link', { name: 'Record weight' })).toHaveAttribute(
		'href',
		`/${COMP}/health?new=weight`
	);
	await expect(asMember.getByRole('link', { name: 'Log health event' })).toHaveAttribute(
		'href',
		`/${COMP}/health?new=1`
	);
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

// Documents has no bottom-nav tab on mobile; it must still be reachable from the
// companion top bar.
test('mobile exposes Documents on a companion page @mobile', async ({ asMember }, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'top-bar Documents link is mobile-only');
	await asMember.goto(`/${COMP}`);
	const docs = asMember.getByRole('link', { name: /documents/i });
	await expect(docs.first()).toHaveAttribute('href', `/${COMP}/documents`);
	await docs.first().click();
	await expect(asMember).toHaveURL(`/${COMP}/documents`, { timeout: 8_000 });
});
