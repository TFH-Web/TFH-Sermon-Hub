export interface User {
	firstName: string;
	lastName: string;
	role: string;
}

export function getUser(): User {
	return {
		firstName: 'Samip',
		lastName: 'Gurung',
		role: 'Admin',
	};
}

export function getFullName(user: User): string {
	return `${user.firstName} ${user.lastName}`;
}

export function getInitials(user: User): string {
	const firstInitial = user.firstName[0];
	const lastInitial = user.lastName[0];
	const initials = `${firstInitial.toUpperCase()}${lastInitial.toUpperCase()}`;
	return initials;
}
