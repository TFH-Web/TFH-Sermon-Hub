import { expect, test } from 'vitest';
import { getInitials, type User } from './user';

const testAdmin: User = {
	id: 0,
	firstName: 'John',
	lastName: 'Doe',
	email: 'johndoe@tfh.org',
	role: 'Admin',
	lastActive: new Date('2026-04-06T12:00:00Z'),
};

test('initials should work', () => {
	expect(getInitials(testAdmin)).toEqual('JD');
});

test('initials should auto-capitalize', () => {
	const user: User = {
		...testAdmin,
		firstName: 'john',
		lastName: 'doe',
	};

	expect(getInitials(user)).toEqual('JD');
});
