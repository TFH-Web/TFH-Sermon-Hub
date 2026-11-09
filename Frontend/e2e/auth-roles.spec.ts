import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';
import { setupRoutes } from './setup';

async function prepareRole(page: Page, role: string) {
	// Set the mocked identity before the application initializes.
	await page.addInitScript(selectedRole => {
		window.sessionStorage.setItem('tfh-e2e-role', selectedRole);
	}, role);

	await setupRoutes(page);

	const sermon = structuredClone(sermons[0]);

	await page.route(`**/api/sermons/${sermon.id}`, route =>
		route.fulfill({ json: sermon }),
	);

	await page.route(`**/api/sermons/${sermon.id}/transcript`, route =>
		route.fulfill({
			json: { transcript: null, segments: [] },
		}),
	);

	return sermon;
}

test('Admin can view a sermon and access edit and delete controls', async ({
	page,
}) => {
	const sermon = await prepareRole(page, 'Admin');

	await page.goto(`/sermons/${sermon.id}`);

	await expect(
		page.getByRole('heading', {
			name: sermon.title,
			exact: true,
			level: 1,
		}),
	).toBeVisible();

	await expect(
		page.getByRole('button', { name: 'Edit', exact: true }),
	).toBeVisible();

	await expect(
		page.getByRole('button', { name: 'Delete', exact: true }),
	).toBeVisible();
});

test('InternalUser can read sermons but cannot access Admin controls or routes', async ({
	page,
}) => {
	const sermon = await prepareRole(page, 'InternalUser');

	await page.goto(`/sermons/${sermon.id}`);

	await expect(
		page.getByRole('heading', {
			name: sermon.title,
			exact: true,
			level: 1,
		}),
	).toBeVisible();

	// Read-only staff can see these actions but cannot activate them.
	await expect(
		page.getByRole('button', { name: 'Edit', exact: true }),
	).toBeDisabled();

	await expect(
		page.getByRole('button', { name: 'Delete', exact: true }),
	).toBeDisabled();

	// Typing an Admin URL must not bypass the route guard.
	await page.goto('/upload');
	await expect(page).toHaveURL(/\/$/);
});

test('an account without a staff role is redirected to the sign-in page', async ({
	page,
}) => {
	await prepareRole(page, 'unassigned');

	await page.goto('/sermons');

	await expect(page).toHaveURL(/\/login$/);
	await expect(
		page.getByText(
			'This account has no Sermon Hub staff role. Ask an administrator for access.',
			{ exact: true },
		),
	).toBeVisible();
});
