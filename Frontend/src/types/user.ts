import type { AccountInfo } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import MurmurHash3 from 'imurmurhash';
import { testUsers } from '$/data/users';

export type Role = 'Admin' | 'User';

export interface User {
	id: string;
	firstName: string;
	lastName: string;
	email: string;
	role: Role;
	lastActive: Date;
}

const isE2ETestMode = import.meta.env.VITE_E2E_TEST === 'true';

function userFromAccount(account: AccountInfo): User {
	const claims = account.idTokenClaims as { roles?: string[] } | undefined;
	const fullName = account.name?.trim() || account.username;
	const [firstName, ...rest] = fullName.split(' ');

	return {
		id: account.localAccountId,
		firstName: firstName || fullName,
		lastName: rest.join(' '),
		email: account.username,
		role: claims?.roles?.includes('Admin') ? 'Admin' : 'User',
		lastActive: new Date(),
	};
}

export function useUser(): User {
	const { accounts } = useMsal();
	const account = accounts[0];

	if (!account) {
		if (!isE2ETestMode) {
			console.warn('useUser(): no signed in MSAL account, using demo user');
		}
		return testUsers[0];
	}

	return userFromAccount(account);
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

export function userHue(u: User): number {
	const digest = u.id + getFullName(u) + u.email;
	const hue = MurmurHash3(digest).result() % 360;
	return hue;
}

export function canRemove(user: User, other: User): boolean {
	return user.role === 'Admin' && other.role === 'User';
}

export function dateRelative(user: User): string {
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	const use = (n: number) => Math.ceil(-n);
	const test = (n: number) => use(n) < 0;

	const delta = Date.now() - user.lastActive.getTime();
	const seconds = delta / 1000;
	const minutes = seconds / 60;
	const hours = minutes / 60;
	const days = hours / 24;
	const weeks = days / 7;
	const months = weeks / 4;
	const years = months / 12;

	switch (true) {
		case test(years):
			return rtf.format(use(years), 'years');
		case test(months):
			return rtf.format(use(months), 'months');
		case test(weeks):
			return rtf.format(use(weeks), 'weeks');
		case test(days):
			return rtf.format(use(days), 'days');
		case test(hours):
			return rtf.format(use(hours), 'hours');
		case test(minutes):
			return rtf.format(use(minutes), 'minutes');
		default:
			return rtf.format(use(seconds), 'seconds');
	}
}
