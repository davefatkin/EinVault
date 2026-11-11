import sharp from 'sharp';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Page } from '@playwright/test';
import { test } from '../lib/fixtures';
import { SEED, type Role } from '../lib/seed';
import { moreButton } from '../lib/more';
import * as schema from '../../src/lib/server/db/schema';
import {
	seedDemoIncidents,
	seedDemoMedications,
	seedDemoReminderHeadsUps,
	seedDemoSupplies
} from '../../src/lib/server/db/demo-seed';

// Regenerates docs/screenshots/*.png from the seeded e2e fixture. Run via the
// dedicated config (see playwright.screenshots.config.ts) — not part of CI.
//
// Emoji note: install a colour emoji font (Noto Color Emoji) and make
// fontconfig prefer it over DejaVu, otherwise the headless browser renders
// some emoji as monochrome outlines. See README/contributing notes if a
// regenerated capture shows grey emoji.

const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots');
const EIN = SEED.companions.ein.id;
// Same date the seed gives Ein's newest journal entry, which links the wellness checkup.
const EIN_JOURNAL_DAY = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

interface Shot {
	name: string;
	role: Role;
	path: string;
	mobile?: boolean;
	/** Runs after the page loads, before the capture (e.g. opening a sheet). */
	prepare?: (page: Page) => Promise<void>;
}

const SHOTS: Shot[] = [
	{ name: 'member_dashboard', role: 'member', path: '/' },
	{ name: 'member_dashboard_mobile', role: 'member', path: '/', mobile: true },
	{ name: 'member_companion', role: 'member', path: `/${EIN}` },
	{ name: 'member_companion_mobile', role: 'member', path: `/${EIN}`, mobile: true },
	{ name: 'member_health', role: 'member', path: `/${EIN}/health` },
	{
		name: 'member_incident',
		role: 'member',
		path: `/${EIN}/health/incidents/${SEED.incidents.einLimp.id}`
	},
	{ name: 'member_medications', role: 'member', path: `/${EIN}/medications` },
	{ name: 'member_supplies', role: 'member', path: `/${EIN}/supplies` },
	{ name: 'member_reminders', role: 'member', path: `/${EIN}/reminders` },
	{
		name: 'member_more_mobile',
		role: 'member',
		path: `/${EIN}`,
		mobile: true,
		prepare: async (page) => {
			await (await moreButton(page)).click();
			await page.getByRole('dialog', { name: 'More sections' }).waitFor();
		}
	},
	{ name: 'member_journal_day', role: 'member', path: `/${EIN}/journal/${EIN_JOURNAL_DAY}` },
	{ name: 'member_notes', role: 'member', path: `/${EIN}/notes` },
	{ name: 'member_note', role: 'member', path: `/${EIN}/notes/${SEED.notes.einCommands.id}` },
	{ name: 'member_sheet', role: 'member', path: `/${EIN}/sheet` },
	{ name: 'member_admin', role: 'admin', path: '/admin/users' },
	{ name: 'caretaker_dashboard', role: 'caretaker', path: `/care/${EIN}` },
	{ name: 'caretaker_dashboard_mobile', role: 'caretaker', path: `/care/${EIN}`, mobile: true },
	{
		name: 'caretaker_journal_mobile',
		role: 'caretaker',
		path: `/care/${EIN}/journal`,
		mobile: true
	},
	{ name: 'caretaker_log', role: 'caretaker', path: `/care/${EIN}/log` },
	{ name: 'caretaker_settings', role: 'caretaker', path: '/care/settings' }
];

const DESKTOP = { width: 1280, height: 900 };
const MOBILE = { width: 500, height: 915 };
const THEMES = ['light', 'dark'] as const;

function openDb(dataDir: string) {
	const sqlite = new Database(path.join(dataDir, 'einvault.db'));
	sqlite.pragma('foreign_keys = ON');
	return { sqlite, db: drizzle(sqlite, { schema }) };
}

async function themedPage(
	app: import('../lib/fixtures').AppWorker,
	browser: import('@playwright/test').Browser,
	role: Role,
	theme: (typeof THEMES)[number],
	mobile = false
) {
	const ctx = await browser.newContext({
		baseURL: app.server.baseURL,
		storageState: await app.stateFor(role, browser),
		viewport: mobile ? MOBILE : DESKTOP,
		deviceScaleFactor: 2,
		reducedMotion: 'reduce',
		colorScheme: theme
	});
	await ctx.addCookies([{ name: 'einvault_theme', value: theme, url: app.server.baseURL }]);
	return { ctx, page: await ctx.newPage() };
}

test('capture screenshots', async ({ app, browser }) => {
	test.setTimeout(300_000);

	// The demo instance's medications, supplies, incidents and heads-ups. The e2e
	// seed leaves them out so specs stay simple; this database is thrown away.
	const { sqlite, db } = openDb(app.dataDir);
	const now = Date.now();
	seedDemoIncidents(db as never, { now });
	seedDemoReminderHeadsUps(db as never, { now });
	seedDemoMedications(db as never, { now });
	seedDemoSupplies(db as never, { now });
	sqlite.close();

	for (const shot of SHOTS) {
		for (const theme of THEMES) {
			const { ctx, page } = await themedPage(app, browser, shot.role, theme, shot.mobile);
			await page.goto(shot.path, { waitUntil: 'networkidle' });
			await shot.prepare?.(page);
			await page.waitForTimeout(500);
			// Hide the footer so the (stale) version string never appears in marketing shots.
			await page.addStyleTag({ content: 'footer { display: none !important; }' });
			await page.screenshot({
				path: path.join(OUT, `${shot.name}_${theme}.png`),
				// Mobile: clip to the initial viewport so the shot stops at the bottom nav
				// instead of scrolling past it. Desktop: full page to show all content.
				fullPage: !shot.mobile
			});
			await ctx.close();
		}
	}

	// Composed hero: left half light, right half dark of the member dashboard.
	const light = path.join(OUT, 'member_dashboard_light.png');
	const dark = path.join(OUT, 'member_dashboard_dark.png');
	const meta = await sharp(light).metadata();
	const w = meta.width ?? 0;
	const h = meta.height ?? 0;
	const halfW = Math.floor(w / 2);
	const leftHalf = await sharp(light)
		.extract({ left: 0, top: 0, width: halfW, height: h })
		.toBuffer();
	const rightHalf = await sharp(dark)
		.extract({ left: halfW, top: 0, width: w - halfW, height: h })
		.toBuffer();
	await sharp({ create: { width: w, height: h, channels: 4, background: '#ffffff' } })
		.composite([
			{ input: leftHalf, left: 0, top: 0 },
			{ input: rightHalf, left: halfW, top: 0 }
		])
		.png()
		.toFile(path.join(OUT, 'member_dashboard_hybrid.png'));
});

// Runs after the main capture on the same worker database. Seeded users have done
// every step, so take back the dose reminders and the doses that drew from stock:
// the card shows 3 of 4 with the medication chain halfway done.
test('capture the getting started card', async ({ app, browser }) => {
	const { sqlite } = openDb(app.dataDir);
	sqlite.prepare('DELETE FROM supply_events WHERE dose_id IS NOT NULL').run();
	sqlite.prepare('DELETE FROM reminders WHERE medication_id IS NOT NULL').run();
	sqlite
		.prepare(
			"UPDATE users SET getting_started = 'auto', getting_started_seen_at = NULL, getting_started_completed_on = NULL"
		)
		.run();
	sqlite.close();

	for (const theme of THEMES) {
		const { ctx, page } = await themedPage(app, browser, 'member', theme);
		await page.goto(`/${EIN}`, { waitUntil: 'networkidle' });
		await page.waitForTimeout(500);
		await page
			.getByTestId('getting-started')
			.screenshot({ path: path.join(OUT, `member_getting_started_${theme}.png`) });
		await ctx.close();
	}
});
