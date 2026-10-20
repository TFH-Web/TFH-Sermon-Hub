import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SermonTag from './SermonTag';

describe('SermonTag', () => {
	it('labels a saved AI tag', () => {
		const html = renderToStaticMarkup(
			<SermonTag tag={{ name: 'grace', source: 'ai' }} />,
		);

		expect(html).toContain('grace');
		expect(html).toContain('AI Generated');
	});

	it('does not label a manual tag as AI-generated', () => {
		const html = renderToStaticMarkup(
			<SermonTag tag={{ name: 'faith', source: 'manual' }} />,
		);

		expect(html).toContain('faith');
		expect(html).not.toContain('AI Generated');
	});

	it('displays tag names as text rather than HTML', () => {
		const html = renderToStaticMarkup(
			<SermonTag tag={{ name: '<script>', source: 'manual' }} />,
		);

		expect(html).toContain('&lt;script&gt;');
		expect(html).not.toContain('<script>');
	});
});
