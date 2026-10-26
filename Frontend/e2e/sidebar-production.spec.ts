import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
if (!existsSync(assets))
	throw new Error(
		'Production CSS tests require npm run build before npm run e2e',
	);
const stylesheet = readdirSync(assets).find(file => file.endsWith('.css'));
if (!stylesheet)
	throw new Error('Run npm run build before the production sidebar test');
const productionCss = readFileSync(path.join(assets, stylesheet), 'utf8');

// This deliberately renders no React app, fixture identity, remote icon or API.
// It exercises the actual compiled CSS: a dev-server-only test misses lowering bugs.
const markup = `
<div class="Layout">
  <aside class="Sidebar Layout-sidebar">
    <div class="Sidebar-title"><h1 class="Sidebar-header">Sermon Hub</h1></div>
    <nav class="Navbar">
      <h2 class="Navbar-header">Main</h2>
      <ul class="Navbar-list">
        <li><a class="NavbarItem u-button is-active" href="#dashboard"><span class="NavbarItem-name">Dashboard</span></a></li>
        <li><a class="NavbarItem u-button" href="#sermons"><span class="NavbarItem-name">Sermons</span></a></li>
      </ul>
    </nav>
    <div class="Profile">
      <h2 class="Profile-name">Staff Member</h2>
      <p class="Profile-role">Admin</p>
      <p class="Profile-initials">SM</p>
      <button type="button" class="Profile-logOut u-button">Log Out</button>
    </div>
  </aside>
  <main class="Layout-main"><h2>Library</h2><p>Normal page content</p></main>
</div>`;

async function colors(page: Page, selector: string) {
	return page.locator(selector).evaluate(element => {
		const canvas = document.createElement('canvas');
		canvas.width = canvas.height = 1;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('Canvas is required to resolve CSS colors');
		const rgb = (value: string) => {
			context.clearRect(0, 0, 1, 1);
			context.fillStyle = value;
			context.fillRect(0, 0, 1, 1);
			return Array.from(context.getImageData(0, 0, 1, 1).data);
		};
		const luminance = (value: number[]) =>
			value.slice(0, 3).reduce((total, channel, index) => {
				const scaled = channel / 255;
				return (
					total +
					(scaled <= 0.04045
						? scaled / 12.92
						: ((scaled + 0.055) / 1.055) ** 2.4) *
						[0.2126, 0.7152, 0.0722][index]
				);
			}, 0);
		let background = [255, 255, 255, 255];
		let opacity = 1;
		let brightness = 1;
		for (
			let current: Element | null = element;
			current;
			current = current.parentElement
		) {
			const style = getComputedStyle(current);
			opacity *= Number(style.opacity);
			for (const match of style.filter.matchAll(/brightness\(([\d.]+)\)/g))
				brightness *= Number(match[1]);
			const candidate = rgb(style.backgroundColor);
			if (background[3] === 255 && candidate[3] === 255) background = candidate;
			// Find the nearest opaque surface, while still counting ancestor opacity.
			if (candidate[3] === 255) break;
		}
		// Navigation/profile opacity composes over the same Sidebar surface.
		const foreground = rgb(getComputedStyle(element).color)
			.slice(0, 3)
			.map((channel, index) =>
				Math.min(
					255,
					(channel * opacity + background[index] * (1 - opacity)) * brightness,
				),
			);
		background = background
			.slice(0, 3)
			.map(channel => Math.min(255, channel * brightness));
		const light = Math.max(luminance(foreground), luminance(background));
		const dark = Math.min(luminance(foreground), luminance(background));
		return {
			contrast: (light + 0.05) / (dark + 0.05),
			backgroundLuminance: luminance(background),
			background,
			outline: getComputedStyle(element).outlineStyle,
			outlineWidth: getComputedStyle(element).outlineWidth,
		};
	});
}

for (const colorScheme of ['light', 'dark'] as const) {
	test(`production sidebar stays dark and readable with ${colorScheme} OS preference`, async ({
		page,
	}) => {
		await page.emulateMedia({ colorScheme });
		await page.route('**/*', route => route.abort());
		await page.setContent(markup);
		await page.addStyleTag({ content: productionCss });
		await page.evaluate(() =>
			Promise.all(
				document.getAnimations().map(animation => animation.finished),
			),
		);
		expect((await colors(page, '.Sidebar')).backgroundLuminance).toBeLessThan(
			0.05,
		);
		expect(
			(await colors(page, '.Layout-main')).backgroundLuminance,
		).toBeGreaterThan(0.8);
		for (const selector of [
			'.Sidebar-header',
			'.Navbar-header',
			'.NavbarItem:not(.is-active)',
			'.NavbarItem.is-active',
			'.Profile-name',
			'.Profile-role',
			'.Profile-logOut',
		]) {
			expect(
				(await colors(page, selector)).contrast,
				selector,
			).toBeGreaterThanOrEqual(4.5);
		}
		const active = page.getByRole('link', { name: 'Dashboard' });
		expect(
			(await colors(page, '.NavbarItem.is-active')).background,
		).not.toEqual(
			(await colors(page, '.NavbarItem:not(.is-active)')).background,
		);
		await active.focus();
		await active.evaluate(element =>
			Promise.all(element.getAnimations().map(animation => animation.finished)),
		);
		expect(
			(await colors(page, '.NavbarItem.is-active')).contrast,
		).toBeGreaterThanOrEqual(4.5);
		const focus = await colors(page, '.NavbarItem.is-active');
		expect(focus.outline).not.toBe('none');
		expect(Number.parseFloat(focus.outlineWidth)).toBeGreaterThanOrEqual(2);
		const logout = page.getByRole('button', { name: 'Log Out' });
		await logout.focus();
		await logout.evaluate(element =>
			Promise.all(element.getAnimations().map(animation => animation.finished)),
		);
		expect(
			(await colors(page, '.Profile-logOut')).contrast,
		).toBeGreaterThanOrEqual(4.5);
		const logoutFocus = await colors(page, '.Profile-logOut');
		expect(logoutFocus.outline).not.toBe('none');
		expect(Number.parseFloat(logoutFocus.outlineWidth)).toBeGreaterThanOrEqual(
			2,
		);
	});
}
