import { expect, type Page, test } from '@playwright/test';
import { setupTagMutationRoutes } from './setup';

test.beforeEach(async ({ page }) => {
	await setupTagMutationRoutes(page);
	await page.goto('/tags');
});

// A new tag is appended after the seeded ones (setup.ts), so with only 5 rows per page
// it lands on whatever the last page is, not page 1 - keep clicking "Next" to get there.
// Reads "Page X of Y" instead of the button's disabled state: right after a click the button
// is briefly disabled while the page refetches, and a one-shot isEnabled() check can land in
// that window and quit early, well before the real last page. expect(...).toHaveText(...)
// retries until the refetch actually finishes instead of trusting a single snapshot in time.
async function goToLastPage(page: Page) {
	const next = page.getByRole('button', { name: 'Next' });
	const feedback = page.getByText(/^Page \d+ of \d+$/);

	for (;;) {
		const [current, total] = [
			...(await feedback.textContent())!.matchAll(/\d+/g),
		].map(Number);
		if (current >= total) return;
		await next.click();
		await expect(feedback).toHaveText(`Page ${current + 1} of ${total}`);
	}
}

// AddTagModal/EditTagModal only close once their mutation's onSuccess (which awaits a cache
// invalidation/refetch) finishes - closing isn't instant after the confirm click resolves. The
// modal's full-viewport overlay sits on top of the page the whole time it's still open, so
// anything that follows must wait it out instead of acting immediately.
async function waitForModalToClose(page: Page) {
	await expect(page.getByRole('dialog')).toBeHidden();
}

// Adds a tag through the Tags & Metadata page's Add Tag modal, exactly as a user would, and
// waits for the modal to close afterwards so callers can act on the page immediately.
async function addTag(page: Page, name: string) {
	await page.getByRole('button', { name: '+ Add Tag' }).click();
	await page.getByPlaceholder('e.g. forgiveness').fill(name);
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Add Tag', exact: true })
		.click();
	await waitForModalToClose(page);
}

// Renames a tag through the Tags & Metadata table's Edit modal, exactly as a user would, and
// waits for the modal to close afterwards so callers can act on the page immediately.
async function renameTag(page: Page, oldName: string, newName: string) {
	const row = page
		.getByRole('rowheader', { name: oldName, exact: true })
		.locator('..');
	await row.getByRole('button', { name: 'Edit' }).click();

	const input = page.getByPlaceholder('e.g. forgiveness');
	await expect(input).toHaveValue(oldName);
	await input.fill(newName);
	await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
	await waitForModalToClose(page);
}

test('adding a tag shows up immediately and survives a reload', async ({
	page,
}) => {
	await addTag(page, 'perseverance');

	await goToLastPage(page);
	await expect(
		page.getByRole('rowheader', { name: 'perseverance' }),
	).toBeVisible();

	await page.reload();
	await goToLastPage(page);
	await expect(
		page.getByRole('rowheader', { name: 'perseverance' }),
	).toBeVisible();
});

test('renaming a tag shows up immediately and survives a reload', async ({
	page,
}) => {
	await renameTag(page, 'grace', 'amazing-grace');

	await expect(
		page.getByRole('rowheader', { name: 'grace', exact: true }),
	).toHaveCount(0);
	await expect(
		page.getByRole('rowheader', { name: 'amazing-grace' }),
	).toBeVisible();

	await page.reload();
	await expect(
		page.getByRole('rowheader', { name: 'amazing-grace' }),
	).toBeVisible();
});

test('deleting a tag removes it immediately and it stays gone after a reload', async ({
	page,
}) => {
	const graceRow = page.getByRole('rowheader', { name: 'grace' }).locator('..');
	await graceRow.getByRole('button', { name: 'Delete' }).click();
	await page
		.getByRole('dialog')
		.getByRole('button', { name: 'Delete' })
		.click();
	await waitForModalToClose(page);

	await expect(
		page.getByRole('rowheader', { name: 'grace', exact: true }),
	).toHaveCount(0);

	await page.reload();
	await expect(
		page.getByRole('rowheader', { name: 'grace', exact: true }),
	).toHaveCount(0);
});

test('a renamed tag shows up as the sermon filter option, not the old name', async ({
	page,
}) => {
	// "grace" is seeded attached to sermons (data.ts gives it count: 10), so it's expected
	// in the filter both before and after the rename.
	await renameTag(page, 'grace', 'amazing-grace');
	await expect(
		page.getByRole('rowheader', { name: 'amazing-grace' }),
	).toBeVisible();

	await page.goto('/sermons');

	// The filter options are <label>s wrapping a hidden radio input (Sermons.tsx), and a hidden
	// input is excluded from the accessibility tree in every engine - getByRole('radio', ...)
	// can never find it. Match on the label's own text instead (rendered capitalized).
	const topics = page.locator('.Sermons-topics');
	await expect(
		topics.getByText('Amazing-grace', { exact: true }),
	).toBeVisible();
	await expect(topics.getByText('Grace', { exact: true })).toHaveCount(0);
});

test('a brand-new tag does not show as a sermon filter option until a sermon uses it', async ({
	page,
}) => {
	// A tag just created through the modal starts attached to zero sermons, so the filter
	// (GET /api/tags?used=true) should leave it out even though it's visible on this page.
	await addTag(page, 'unused-topic');

	await goToLastPage(page);
	await expect(
		page.getByRole('rowheader', { name: 'unused-topic' }),
	).toBeVisible();

	await page.goto('/sermons');

	// Confirm the fieldset actually loaded (otherwise an absent label below would be a false
	// pass), then confirm the unused tag isn't one of its options.
	const topics = page.locator('.Sermons-topics');
	await expect(topics.getByText('All', { exact: true })).toBeVisible();
	await expect(topics.getByText('unused-topic', { exact: true })).toHaveCount(
		0,
	);
});
