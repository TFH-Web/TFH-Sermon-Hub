import { defineConfig, devices } from '@playwright/test';

const python = process.env.TFH_E2E_PYTHON || 'python';

export default defineConfig({
	testDir: './e2e-integration',
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	timeout: 60_000,
	outputDir: 'test-results/integration',
	reporter: [
		['list'],
		['html', { outputFolder: 'playwright-report/integration', open: 'never' }],
	],
	use: {
		baseURL: 'http://127.0.0.1:5360',
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'retain-on-failure',
	},
	projects: [
		{ name: 'integration-chromium', use: { ...devices['Desktop Chrome'] } },
	],
	webServer: [
		{
			command: `"${python}" ../Backend/e2e/server.py`,
			url: 'http://127.0.0.1:6200/api/health',
			reuseExistingServer: false,
			timeout: 120_000,
			env: { TFH_E2E: '1', PYTHON_DOTENV_DISABLED: '1' },
		},
		{
			command: 'npm run dev -- --config vite.integration.config.ts',
			url: 'http://127.0.0.1:5360',
			reuseExistingServer: false,
			env: {
				VITE_E2E_TEST: 'true',
				VITE_API_BASE_URL: '/',
				VITE_CLIENT_ID: '00000000-0000-4000-8000-000000000001',
				VITE_TENANT_ID: '00000000-0000-4000-8000-000000000002',
				VITE_REDIRECT_URI: 'http://127.0.0.1:5360',
				VITE_API_SCOPE: '',
			},
		},
	],
});
