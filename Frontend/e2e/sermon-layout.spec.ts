import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';

// Keep layout checks independent of YouTube availability and real sermon data.
async function setupDetail(page: Page) {
	const state = { deletes: 0 };
	const sermon = {
		...sermons[0],
		title: 'The Empowerment of the Believer',
		videoLink: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
		summary: 'A saved summary for reviewing the sermon layout.',
		summarySource: 'manual',
	};
	await page.route('**/api/**', route => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/api/sermons') return route.fulfill({ json: [sermon] });
		if (path === '/api/sermons/1') {
			if (route.request().method() === 'DELETE') {
				state.deletes += 1;
				return route.fulfill({ status: 204, body: '' });
			}
			return route.fulfill({ json: sermon });
		}
		if (path === '/api/sermons/1/transcript') {
			return route.fulfill({ json: { transcript: null, segments: [] } });
		}
		return route.abort();
	});
	await page.addInitScript(() => {
		Object.assign(window, {
			YT: {
				Player: class {
					private iframe: HTMLIFrameElement;

					constructor(
						container: HTMLElement,
						options: {
							events: { onReady: (event: { target: unknown }) => void };
						},
					) {
						this.iframe = document.createElement('iframe');
						// Match YouTube's fixed attributes; the page CSS must override them.
						this.iframe.width = '640';
						this.iframe.height = '390';
						this.iframe.dataset.testid = 'layout-video';
						// The SDK replaces this target; retain a full-size holder in the mock.
						container.style.height = '100%';
						container.replaceChildren(this.iframe);
						setTimeout(() => options.events.onReady({ target: this }), 0);
					}

					getIframe() {
						return this.iframe;
					}
					destroy() {
						this.iframe.remove();
					}
				},
			},
		});
	});
	return state;
}

for (const width of [1440, 1024, 768, 390, 320]) {
	test(`video fills a responsive 16:9 container at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 1000 });
		await setupDetail(page);
		await page.goto('/sermons/1');
		const frame = page.getByTestId('layout-video');
		await expect(frame).toBeVisible();
		await expect
			.poll(async () =>
				frame.evaluate(element => {
					const video = element.getBoundingClientRect();
					const container = element
						.closest('.SermonDetail-videoPlaceholder')
						?.getBoundingClientRect();
					if (!container) return false;
					return (
						Math.abs(video.width / video.height - 16 / 9) < 0.02 &&
						Math.abs(video.width - container.width) < 2 &&
						Math.abs(video.height - container.height) < 2 &&
						video.left >= 0 &&
						video.right <= window.innerWidth
					);
				}),
			)
			.toBe(true);

		expect(
			await page
				.locator('.Layout-main')
				.evaluate(element => element.scrollWidth <= element.clientWidth + 1),
		).toBe(true);
		const video = await frame.boundingBox();
		const info = await page.locator('.SermonDetail-info').boundingBox();
		expect(video).not.toBeNull();
		expect(info).not.toBeNull();
		if (!video || !info) throw new Error('Missing video or title');
		if (width === 1440) {
			// The enlarged video occupies most of the row, with the title beside it.
			expect(video.width).toBeGreaterThan(650);
			expect(info.x).toBeGreaterThanOrEqual(video.x + video.width);
		} else {
			expect(info.y).toBeGreaterThanOrEqual(video.y + video.height - 1);
		}
	});
}

for (const width of [1440, 390]) {
	test(`separate Delete action retains keyboard confirmation and cancellation at ${width}px`, async ({
		page,
	}) => {
		await page.setViewportSize({ width, height: 1000 });
		const state = await setupDetail(page);
		await page.goto('/sermons/1');
		const danger = page.getByRole('region', {
			name: 'Delete sermon',
			exact: true,
		});
		const button = danger.getByRole('button', { name: 'Delete', exact: true });
		await expect(button).toBeEnabled();
		await expect(
			page
				.locator('.SermonDetail-btn-group')
				.getByRole('button', { name: 'Delete', exact: true }),
		).toHaveCount(0);
		await button.scrollIntoViewIfNeeded();
		const rect = await button.boundingBox();
		expect(rect).not.toBeNull();
		if (!rect) throw new Error('Missing Delete button');
		expect(rect.x).toBeGreaterThanOrEqual(0);
		expect(rect.x + rect.width).toBeLessThanOrEqual(width);
		expect(
			await danger.evaluate(element => {
				const content = document.querySelector('.SermonDetail-grid');
				return (
					!!content &&
					element.getBoundingClientRect().top >
						content.getBoundingClientRect().bottom
				);
			}),
		).toBe(true);

		await button.focus();
		await page.keyboard.press('Enter');
		const dialog = page.getByRole('dialog');
		await expect(dialog).toContainText('This action cannot be undone.');
		expect(state.deletes).toBe(0);
		await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
		await expect(dialog).toHaveCount(0);
		expect(state.deletes).toBe(0);

		await button.click();
		await dialog
			.getByRole('button', { name: 'Delete Sermon', exact: true })
			.click();
		await expect(page).toHaveURL(/\/sermons$/);
		expect(state.deletes).toBe(1);
	});
}
