import path from 'node:path';
import Database from 'better-sqlite3';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { waitForHydration } from './hydration';

/** Creates an empty companion through the UI and returns its id (the page lands on its dashboard). */
export async function createCompanionViaUi(page: Page, name: string): Promise<string> {
	await page.goto('/companions/new');
	await waitForHydration(page);
	await page.locator('#name').fill(name);
	await page.getByRole('button', { name: 'Add Companion' }).click();
	await expect(page).not.toHaveURL(/\/companions\/new/, { timeout: 10_000 });
	const id = new URL(page.url()).pathname.split('/').filter(Boolean)[0];
	return id;
}

/** Deletes a companion created by a test, with everything that hangs off it. */
export function deleteCompanionByName(dataDir: string, name: string) {
	const sqlite = new Database(path.join(dataDir, 'einvault.db'));
	try {
		sqlite.pragma('foreign_keys = ON');
		sqlite.prepare('DELETE FROM companions WHERE name = ?').run(name);
	} finally {
		sqlite.close();
	}
}

/** Archives a companion behind the app's back (is_active = 0). */
export function archiveCompanion(dataDir: string, id: string) {
	const sqlite = new Database(path.join(dataDir, 'einvault.db'));
	try {
		sqlite
			.prepare("UPDATE companions SET is_active = 0, archived_at = datetime('now') WHERE id = ?")
			.run(id);
	} finally {
		sqlite.close();
	}
}
