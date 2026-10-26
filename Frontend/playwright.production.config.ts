import { defineConfig, devices } from '@playwright/test';

// Runs the production-CSS regression without starting Vite or contacting an API.
export default defineConfig({
	testDir: './e2e',
	testMatch: 'sidebar-production.spec.ts',
	forbidOnly: !!process.env.CI,
	workers: 1,
	reporter: 'line',
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
