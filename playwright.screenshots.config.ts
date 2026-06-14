import { defineConfig, devices } from '@playwright/test';

// Standalone config for regenerating docs/screenshots/*.png.
// Kept separate from playwright.config.ts (testDir tests/e2e) so this never
// runs in CI. Usage: npm run build && npx playwright test --config playwright.screenshots.config.ts
export default defineConfig({
	testDir: 'tests/screenshots',
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: 'list',
	use: { ...devices['Desktop Chrome'] }
});
