import { test, expect } from '../lib/fixtures';
import { pdfUpload } from '../lib/files';

const COMP = 'seed-comp-biscuit';

test.describe('documents', () => {
	test('upload PDF', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/documents`);

		const fileInput = asMember.locator('input[type="file"]');
		await fileInput.setInputFiles(pdfUpload('e2e-doc.pdf'));

		// Title defaults to the filename
		await expect(asMember.getByText('e2e-doc.pdf')).toBeVisible({ timeout: 15_000 });

		// Persists after reload
		await asMember.reload();
		await expect(asMember.getByText('e2e-doc.pdf')).toBeVisible({ timeout: 10_000 });
	});

	test('edit metadata', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/documents`);

		// Upload a dedicated doc for this test
		const fileInput = asMember.locator('input[type="file"]');
		await fileInput.setInputFiles(pdfUpload('e2e-doc-edit-src.pdf'));
		await expect(asMember.getByText('e2e-doc-edit-src.pdf')).toBeVisible({ timeout: 15_000 });

		// Click the edit (pencil) button for this doc
		const listItem = asMember.locator('li').filter({ hasText: 'e2e-doc-edit-src.pdf' }).first();
		await listItem.getByRole('button', { name: 'Edit document' }).click();

		// After clicking, the inline edit form opens. The li re-renders so we use
		// page-level locators for the form fields (there is only one edit form open).
		const titleInput = asMember.locator('input[id^="doc-title-"]');
		await titleInput.fill('e2e-doc-renamed');

		// Set category to 'medical'
		const categorySelect = asMember.locator('select[id^="doc-cat-"]');
		await categorySelect.selectOption('medical');

		// Save
		await asMember.getByRole('button', { name: 'Save' }).first().click();

		// Renamed title should appear, old name gone
		await expect(asMember.getByText('e2e-doc-renamed')).toBeVisible({ timeout: 8_000 });
		await expect(asMember.getByText('e2e-doc-edit-src.pdf', { exact: true })).toHaveCount(0);

		// Reload and confirm persistence
		await asMember.reload();
		await expect(asMember.getByText('e2e-doc-renamed')).toBeVisible({ timeout: 10_000 });
		// Medical badge should be visible in the document list item (scoped to avoid the select option)
		const renamedItem = asMember.locator('li').filter({ hasText: 'e2e-doc-renamed' }).first();
		await expect(renamedItem.locator('.rounded-full', { hasText: 'Medical' })).toBeVisible();
	});

	test('download', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/documents`);

		const fileInput = asMember.locator('input[type="file"]');
		await fileInput.setInputFiles(pdfUpload('e2e-doc-dl.pdf'));
		await expect(asMember.getByText('e2e-doc-dl.pdf')).toBeVisible({ timeout: 15_000 });

		// Find the download anchor for this doc
		const listItem = asMember.locator('li').filter({ hasText: 'e2e-doc-dl.pdf' }).first();
		const downloadLink = listItem.locator('a[aria-label="Download"]');
		const href = await downloadLink.getAttribute('href');
		expect(href).toBeTruthy();

		// Fetch via the authenticated request context
		const response = await asMember.request.get(href!);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toContain('application/pdf');

		const body = await response.body();
		expect(body.subarray(0, 5).toString('ascii')).toBe('%PDF-');
	});

	test('delete', async ({ asMember }) => {
		await asMember.goto(`/${COMP}/documents`);

		const fileInput = asMember.locator('input[type="file"]');
		await fileInput.setInputFiles(pdfUpload('e2e-doc-del.pdf'));
		await expect(asMember.getByText('e2e-doc-del.pdf')).toBeVisible({ timeout: 15_000 });

		// Click the delete button for this doc
		const listItem = asMember.locator('li').filter({ hasText: 'e2e-doc-del.pdf' }).first();
		await listItem.getByRole('button', { name: 'Delete' }).click();

		// ConfirmDialog appears — confirm deletion
		const confirmDialog = asMember.locator('[role="dialog"]');
		await confirmDialog.getByRole('button', { name: 'Delete' }).click();

		// Row should be gone
		await expect(asMember.getByText('e2e-doc-del.pdf')).toHaveCount(0, { timeout: 8_000 });

		// Reload and confirm still gone
		await asMember.reload();
		await expect(asMember.getByText('e2e-doc-del.pdf')).toHaveCount(0);
	});

	test('caretaker blocked', async ({ asCaretaker }) => {
		const response = await asCaretaker.request.get(`/api/companions/${COMP}/documents`);
		expect(response.status()).toBe(403);
	});
});
