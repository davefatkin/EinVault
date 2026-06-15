import sharp from 'sharp';
import path from 'node:path';
import { test } from '../lib/fixtures';
import { SEED, type Role } from '../lib/seed';

// Regenerates docs/screenshots/*.png from the seeded e2e fixture. Run via the
// dedicated config (see playwright.screenshots.config.ts) — not part of CI.
//
// Emoji note: install a colour emoji font (Noto Color Emoji) and make
// fontconfig prefer it over DejaVu, otherwise the headless browser renders
// some emoji as monochrome outlines. See README/contributing notes if a
// regenerated capture shows grey emoji.

const OUT = path.resolve(import.meta.dirname, '../../docs/screenshots');
const EIN = SEED.companions.ein.id;

interface Shot {
	name: string;
	role: Role;
	path: string;
	mobile?: boolean;
}

const SHOTS: Shot[] = [
	{ name: 'member_dashboard', role: 'member', path: '/' },
	{ name: 'member_dashboard_mobile', role: 'member', path: '/', mobile: true },
	{ name: 'member_companion', role: 'member', path: `/${EIN}` },
	{ name: 'member_companion_mobile', role: 'member', path: `/${EIN}`, mobile: true },
	{ name: 'member_health', role: 'member', path: `/${EIN}/health` },
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

test('capture screenshots', async ({ app, browser }) => {
	test.setTimeout(240_000);

	for (const shot of SHOTS) {
		const state = await app.stateFor(shot.role, browser);
		for (const theme of THEMES) {
			const ctx = await browser.newContext({
				baseURL: app.server.baseURL,
				storageState: state,
				viewport: shot.mobile ? MOBILE : DESKTOP,
				deviceScaleFactor: 2,
				reducedMotion: 'reduce',
				colorScheme: theme
			});
			await ctx.addCookies([{ name: 'einvault_theme', value: theme, url: app.server.baseURL }]);
			const page = await ctx.newPage();
			await page.goto(shot.path, { waitUntil: 'networkidle' });
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
