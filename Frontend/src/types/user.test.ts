import { expect, suite, test } from 'vitest';
import { canRemove, getFullName, getInitials, type User } from './user';

const testAdmin: User = {
	id: 0,
	firstName: 'Jane',
	lastName: 'Doe',
	email: 'janedow@tfh.org',
	role: 'Admin',
	lastActive: new Date('2026-04-07T12:00:00Z'),
};

const testUser: User = {
	id: 1,
	firstName: 'John',
	lastName: 'Doe',
	email: 'johndoe@tfh.org',
	role: 'User',
	lastActive: new Date('2026-04-06T12:00:00Z'),
};

suite('Names', () => {
	test('initials should work', () => {
		expect(getInitials(testAdmin)).toBe('JD');
	});

	test('initials should auto-capitalize', () => {
		const user: User = {
			...testAdmin,
			firstName: 'jane',
			lastName: 'doe',
		};

		expect(getInitials(user)).toBe('JD');
	});

	test('full name should work', () => {
		expect(getFullName(testAdmin)).toBe('Jane Doe');
		expect(getFullName(testUser)).toBe('John Doe');
	})
});

test('only admins can remove, only users can be removed', () => {
	expect(canRemove(testAdmin, testUser)).toBe(true);
	expect(canRemove(testAdmin, testAdmin)).toBe(false);
	expect(canRemove(testUser, testAdmin)).toBe(false);
	expect(canRemove(testUser, testUser)).toBe(false);
});
