import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SermonSummaryOrigin from './SermonSummaryOrigin';

describe('SermonSummaryOrigin', () => {
	it('labels an existing summary with confirmed AI origin', () => {
		const html = renderToStaticMarkup(
			<SermonSummaryOrigin
				summary="A summary about grace."
				summarySource="ai"
			/>,
		);

		expect(html).toContain('AI Generated');
	});

	it.each([
		'manual',
		null,
		undefined,
	] as const)('does not invent AI origin for source %j', summarySource => {
		const html = renderToStaticMarkup(
			<SermonSummaryOrigin
				summary="A saved summary."
				summarySource={summarySource}
			/>,
		);

		expect(html).toBe('');
	});

	it.each(['', '   '])('does not label an empty summary %j', summary => {
		const html = renderToStaticMarkup(
			<SermonSummaryOrigin summary={summary} summarySource="ai" />,
		);

		expect(html).toBe('');
	});
});
