export const speakers = [
	{
		id: 1,
		firstName: 'Dave',
		lastName: 'Patterson',
		role: 'Lead Speaker',
	},
	...Array.from({ length: 9 }, (_, index) => ({
		id: index + 2,
		firstName: 'Speaker',
		lastName: `No. ${index + 2}`,
		role: 'Guest Speaker',
	})),
];

export const seriess = [{ id: 1, title: 'Grace Series' }];

export const tags = [{ name: 'grace', source: 'manual', count: 10 }];

export const sermons = Array.from({ length: 10 }, (_, index) => ({
	id: index + 1,
	title: `Sermon ${index + 1}`,
	videoLink: 'https://youtu.be/example',
	duration: 1200,
	date: `2026-02-${10 + index}`,
	description: 'A message about grace.',
	tags: tags.slice(0, 1),
	speaker: speakers[0],
	series: seriess[0],
	status: 'Published',
}));
