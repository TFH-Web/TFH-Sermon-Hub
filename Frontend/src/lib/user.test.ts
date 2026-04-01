import { expect, test } from "vitest";
import { getInitials, type User } from "./user";

test('initials should work', () => {
	const user: User = {
		firstName: 'John',
		lastName: 'Doe',
		role: 'Admin',
	}
	expect(getInitials(user)).toEqual("JD");
});

test('initials should auto-capitalize', () => {
	const user: User = {
		firstName: 'john',
		lastName: 'doe',
		role: 'Admin',
	}

	expect(getInitials(user)).toEqual("JD");
});
