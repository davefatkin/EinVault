import { test, expect } from '../lib/fixtures';
import type { Page } from '@playwright/test';
import { waitForHydration } from '../lib/hydration';
import { pdfUpload, pngUpload } from '../lib/files';
import { createIncidentViaUi, deleteIncidentViaUi } from '../lib/incidents';

// Owner incident page (#282). Every test creates its own incident with a unique
// title and deletes it in `finally`, so no open incident outlives the test.

const COMP = 'seed-comp-ein';
const unique = (label: string) => `e2e-inc-${label}-${Date.now().toString(36)}`;

const statusChip = (page: Page) => page.getByTestId('incident-status');
const severityChip = (page: Page) => page.getByTestId('incident-severity');

async function addUpdate(page: Page, body: string, severity?: string) {
	await page.getByRole('button', { name: 'Update', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.locator('textarea[name="body"]').fill(body);
	if (severity) await dialog.locator('select[name="severity"]').selectOption(severity);
	await dialog.getByRole('button', { name: 'Save update' }).click();
	await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });
	await expect(page.getByText(body)).toBeVisible();
}

test.describe('incidents (owner)', () => {
	test('create incident with severity and see it on the Health Log open section', async ({
		asMember
	}) => {
		const title = unique('create');
		let id: string | undefined;
		try {
			await asMember.goto(`/${COMP}/health/incidents/new`);
			await waitForHydration(asMember);
			await asMember.locator('#incident-title').fill(title);
			await asMember.locator('#incident-severity').selectOption('severe');
			await asMember.locator('#incident-notes').fill('Started after the long hike.');
			await asMember.locator('#incident-files').setInputFiles(pngUpload('paw.png'));
			await asMember.getByRole('button', { name: 'Save incident' }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health/incidents/(?!new$)[^/?#]+$`), {
				timeout: 10_000
			});
			id = new URL(asMember.url()).pathname.split('/').pop();

			await expect(asMember.getByRole('heading', { level: 1, name: title })).toBeVisible();
			await expect(statusChip(asMember)).toContainText('Ongoing');
			await expect(severityChip(asMember)).toHaveText('Severe');
			await expect(asMember.getByText('Started after the long hike.')).toBeVisible();
			// The photo picked in the form went up after the incident was saved.
			await expect(asMember.locator('img[alt="paw.png"]').first()).toBeVisible();

			await asMember.getByRole('link', { name: 'Health Log' }).click();
			await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health$`));
			const open = asMember.getByRole('region', { name: 'Open incidents' });
			await expect(open).toContainText(title);
			await open.getByRole('link', { name: title }).click();
			await expect(asMember).toHaveURL(new RegExp(`/health/incidents/${id}$`));
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('add an update with severity and see current severity change', async ({ asMember }) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, {
				title: unique('sev'),
				severity: 'moderate'
			});
			await expect(severityChip(asMember)).toHaveText('Moderate');

			await addUpdate(asMember, 'Walking fine on the morning walk.', 'mild');
			await expect(severityChip(asMember)).toHaveText('Mild');

			// A search hit on an update lands on the incident at that update.
			const anchor = await asMember.locator('[id^="update-"]').first().getAttribute('id');
			expect(anchor).toBeTruthy();
			await asMember.goto(`/${COMP}/health?incidentUpdate=${anchor!.slice('update-'.length)}`);
			await expect(asMember).toHaveURL(new RegExp(`/health/incidents/${id}#${anchor}$`));
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('edit and delete an update', async ({ asMember }) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('edit') });
			await addUpdate(asMember, 'First draft of the update.');

			const item = asMember.locator('[id^="update-"]').first();
			await item.getByRole('button', { name: 'Edit' }).click();
			await item.locator('textarea[name="body"]').fill('Edited update text.');
			await item.getByRole('button', { name: 'Save update' }).click();
			await expect(asMember.getByText('Edited update text.')).toBeVisible();
			await expect(asMember.getByText('First draft of the update.')).toHaveCount(0);

			await asMember
				.locator('[id^="update-"]')
				.first()
				.getByRole('button', { name: 'Delete' })
				.click();
			await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
			await expect(asMember.getByText('Edited update text.')).toHaveCount(0);
			await asMember.reload();
			await expect(asMember.getByText('Edited update text.')).toHaveCount(0);
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('resolve with a closing update moves it out of open incidents', async ({ asMember }) => {
		const title = unique('resolve');
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title, severity: 'mild' });
			await asMember.getByRole('button', { name: 'Mark resolved' }).click();
			const dialog = asMember.getByRole('dialog');
			await dialog.locator('textarea[name="body"]').fill('All better, back to normal walks.');
			await dialog.getByRole('button', { name: 'Mark resolved' }).click();
			await expect(asMember.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

			await expect(statusChip(asMember)).toContainText('Resolved');
			await expect(asMember.getByText('All better, back to normal walks.')).toBeVisible();
			await expect(asMember.getByRole('button', { name: 'Reopen' })).toBeVisible();

			await asMember.goto(`/${COMP}/health`);
			await expect(asMember.getByRole('region', { name: 'Open incidents' })).toHaveCount(0);
			// Still in the Health Log list, as an incident that opens its own page.
			await asMember.getByRole('link', { name: new RegExp(title) }).click();
			await expect(asMember).toHaveURL(new RegExp(`/health/incidents/${id}$`));
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('a linked vet visit shows on the timeline', async ({ asMember }) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('linked') });
			// The link picker comes later; post to the page's link action directly.
			const status = await asMember.evaluate(async () => {
				const fd = new FormData();
				fd.set('healthEventId', 'seed-health-2');
				const res = await fetch('?/link', {
					method: 'POST',
					body: fd,
					headers: { 'x-sveltekit-action': 'true' }
				});
				return ((await res.json()) as { type: string }).type;
			});
			expect(status).toBe('success');
			await asMember.reload();
			const progress = asMember.getByRole('region', { name: 'Progress' });
			await expect(progress).toContainText('Rabies vaccination');
			await expect(progress).toContainText('Dr. Bacchus · Animal Treasure Veterinary');
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('detailHealth link opens the incident page', async ({ asMember }) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('deeplink') });
			await asMember.goto(`/${COMP}/health?detailHealth=${id}`);
			await expect(asMember).toHaveURL(new RegExp(`/${COMP}/health/incidents/${id}$`));
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('incident type is not offered in the generic Add Event form', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/health`);
		await waitForHydration(asMember);
		await asMember.getByRole('button', { name: 'Add Event' }).click();
		const type = asMember.locator('select[name="type"]');
		await expect(type).toBeVisible();
		await expect(type.locator('option[value="incident"]')).toHaveCount(0);
		await expect(type.locator('option[value="vet_visit"]')).toHaveCount(1);
	});

	test('print view hides actions', async ({ asMember }) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('print') });
			await addUpdate(asMember, 'Ate dinner, still limping a bit.');
			const updateButton = asMember.getByRole('button', { name: 'Update', exact: true });
			await expect(updateButton).toBeVisible();
			await asMember.emulateMedia({ media: 'print' });
			try {
				await expect(updateButton).toBeHidden();
				await expect(asMember.getByRole('button', { name: 'Print' })).toBeHidden();
				await expect(asMember.getByText('Ate dinner, still limping a bit.')).toBeVisible();
			} finally {
				await asMember.emulateMedia({ media: null });
			}
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('delete incident returns to the Health Log', async ({ asMember }) => {
		const title = unique('delete');
		let id: string | undefined;
		let deleted = false;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title });
			await deleteIncidentViaUi(asMember, COMP, id);
			deleted = true;
			await expect(asMember.getByText(title)).toHaveCount(0);
			const res = await asMember.goto(`/${COMP}/health/incidents/${id}`);
			expect(res?.status()).toBe(404);
		} finally {
			if (id && !deleted) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});
	test('link a vet visit from the incident page and see it in the timeline', async ({
		asMember
	}) => {
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('link') });
			await asMember.getByRole('button', { name: 'Link vet visit' }).click();
			const dialog = asMember.getByRole('dialog');
			await dialog.getByRole('button', { name: /Wellness checkup/ }).click();
			await expect(asMember.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 });

			const progress = asMember.getByRole('region', { name: 'Progress' });
			await expect(progress).toContainText('Wellness checkup');

			// Already linked, so it is no longer offered.
			await asMember.getByRole('button', { name: 'Link vet visit' }).click();
			await expect(
				asMember.getByRole('dialog').getByRole('button', { name: /Wellness checkup/ })
			).toHaveCount(0);
			await asMember.keyboard.press('Escape');

			await progress.getByRole('button', { name: 'Unlink Wellness checkup' }).click();
			await expect(progress).not.toContainText('Wellness checkup');
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('link from the vet visit modal via About incident and unlink again', async ({
		asMember
	}) => {
		const title = unique('about');
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title });
			await asMember.goto(`/${COMP}/health`);
			await waitForHydration(asMember);
			await asMember.getByText('Wellness checkup').first().click();
			const dialog = asMember.getByRole('dialog');
			await dialog.getByRole('button', { name: 'Link to an incident' }).click();
			await dialog.getByRole('button', { name: new RegExp(title) }).click();
			const about = dialog.getByTestId('health-detail-incidents');
			await expect(about.getByRole('link', { name: title })).toBeVisible();

			// The incident page lists it too.
			await asMember.goto(`/${COMP}/health/incidents/${id}`);
			await expect(asMember.getByRole('region', { name: 'Progress' })).toContainText(
				'Wellness checkup'
			);

			await asMember.goto(`/${COMP}/health`);
			await waitForHydration(asMember);
			await asMember.getByText('Wellness checkup').first().click();
			const again = asMember.getByRole('dialog').getByTestId('health-detail-incidents');
			await again.getByRole('button', { name: `Unlink from ${title}` }).click();
			await expect(again.getByRole('link', { name: title })).toHaveCount(0);
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
		}
	});

	test('candidates endpoint is closed to caretakers', async ({ asCaretaker, asMember }) => {
		const url = `/${COMP}/health/incidents/candidates?eventId=seed-health-1`;
		expect((await asCaretaker.request.get(url)).status()).toBe(403);
		expect((await asMember.request.get(url)).status()).toBe(200);
	});

	test('attach a PDF from the incident page and see it under Related', async ({ asMember }) => {
		const name = `${unique('attach')}.pdf`;
		const docTitle = name.replace(/\.pdf$/, '');
		let id: string | undefined;
		try {
			id = await createIncidentViaUi(asMember, COMP, { title: unique('attach') });
			await asMember.getByTestId('incident-attach-file').setInputFiles(pdfUpload(name));
			const related = asMember.getByRole('region', { name: 'Related' });
			await expect(related).toContainText(docTitle, { timeout: 10_000 });
		} finally {
			if (id) await deleteIncidentViaUi(asMember, COMP, id);
			// Deleting the incident only detaches the document; remove it too.
			await asMember.goto(`/${COMP}/documents`);
			await waitForHydration(asMember);
			const row = asMember.locator('li').filter({ hasText: docTitle }).first();
			if ((await row.count()) > 0) {
				await row.getByRole('button', { name: 'Delete' }).click();
				await asMember.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
				await expect(asMember.getByText(docTitle)).toHaveCount(0, { timeout: 8_000 });
			}
		}
	});
});
