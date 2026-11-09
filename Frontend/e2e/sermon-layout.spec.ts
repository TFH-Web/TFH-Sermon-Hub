import { expect, type Page, test } from '@playwright/test';
import { sermons } from './data';

// Keep layout checks independent of YouTube availability and real sermon data.
async function setupDetail(page: Page) {
	const sermon = {
		...sermons[0],
		title: 'Client feedback sermon',
		videoLink: 'https://www.youtube.com/watch?v=F_OiCiZ3Y3Y',
		summary: 'A saved summary for reviewing the sermon layout.',
		summarySource: 'manual',
	};
	await page.route('**/api/**', route => {
		const path = new URL(route.request().url()).pathname;
		if (path === '/api/sermons') return route.fulfill({ json: [sermon] });
		if (path === '/api/sermons/1') return route.fulfill({ json: sermon });
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
