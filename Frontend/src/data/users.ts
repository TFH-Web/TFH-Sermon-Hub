import type { User } from '$/types/user.ts';

export const testUsers: User[] = [
	{
		id: 0,
		firstName: 'Samip',
		lastName: 'Gurung',
		email: 'samip@tfh.org',
		role: 'Admin',
		lastActive: new Date('2026-04-07T12:00:00Z'),
	},
	{
		id: 1,
		firstName: 'Givin',
		lastName: 'Yang',
		email: 'givin@tfh.org',
		role: 'Admin',
		lastActive: new Date('2026-04-05T12:00:00Z'),
	},
	{
		id: 2,
		firstName: 'Nicole',
		lastName: 'Espinoza',
		email: 'nicole@tfh.org',
		role: 'User',
		lastActive: new Date('2026-04-06T12:00:00Z'),
	},
	{
		id: 3,
		firstName: 'June',
		lastName: 'Paulino',
		email: 'june@tfh.org',
		role: 'User',
		lastActive: new Date('2026-04-04T12:00:00Z'),
	},
];
