import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI
		? 'blob'
		: ([['html', { open: 'never' }], ['list']] as NonNullable<
				Parameters<typeof defineConfig>[0]['reporter']
			>),
	globalSetup: './tests/lib/global-setup.ts',
	use: {
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
		video: 'off'
	},
	projects: [
		{
			name: 'setup-wizard',
			testMatch: /setup\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'desktop',
			testIgnore: /setup\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile',
			testIgnore: /setup\.spec\.ts/,
			grep: /@mobile/,
			use: { ...devices['Pixel 7'] }
		}
	]
});
