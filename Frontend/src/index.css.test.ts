import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';

const srcDir = path.resolve(__dirname);

function cssFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return cssFiles(full);
		return entry.name.endsWith('.css') ? [full] : [];
	});
}

// The production build rewrites light-dark() into a fallback that needs color-scheme
// declared. The dev server does not rewrite it, so a missing declaration only breaks
// the deployed site: every color token becomes invalid there.
it('declares color-scheme on :root whenever light-dark() colors are used', () => {
	const usesLightDark = cssFiles(srcDir).some(file =>
		readFileSync(file, 'utf8').includes('light-dark('),
	);
	expect(usesLightDark).toBe(true);

	const indexCss = readFileSync(path.join(srcDir, 'index.css'), 'utf8');
	const rootBlock = indexCss.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
	expect(rootBlock).toMatch(/^\s*color-scheme:\s*light\s*;/m);
});
