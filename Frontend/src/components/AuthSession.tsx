import {
	type AuthenticationResult,
	EventType,
	InteractionStatus,
	InteractionType,
} from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { type PropsWithChildren, useEffect, useReducer, useRef } from 'react';
import {
	hasStaffRole,
	isAuthTestMode,
	selectedAccount,
	useAuth,
} from '$/lib/auth';

export default function AuthSession({ children }: PropsWithChildren) {
	const { instance, accounts, inProgress } = useMsal();
	const queryClient = useQueryClient();
	const previousAccount = useRef<string | null>(null);
	const [, refreshAccount] = useReducer(value => value + 1, 0);
	const account = selectedAccount(instance, accounts);
	useEffect(() => {
		const id = instance.addEventCallback(event => {
			if (event.eventType === EventType.ACTIVE_ACCOUNT_CHANGED)
				refreshAccount();
			if (
				event.eventType === EventType.ACQUIRE_TOKEN_SUCCESS &&
				event.interactionType === InteractionType.Redirect
			) {
				const result = event.payload as AuthenticationResult | null;
				if (result?.account) {
					instance.setActiveAccount(result.account);
					refreshAccount();
				}
			}
			if (
				event.eventType === EventType.ACQUIRE_TOKEN_FAILURE &&
				event.interactionType === InteractionType.Redirect
			) {
				useAuth.setState({
					status: 'error',
					roles: [],
					message:
						'Microsoft sign-in failed. Try again or choose another account.',
				});
			}
		});
		return () => {
			if (id) instance.removeEventCallback(id);
		};
	}, [instance]);
	useEffect(() => {
		if (isAuthTestMode || inProgress !== InteractionStatus.None) return;
		if (previousAccount.current !== (account?.homeAccountId ?? null)) {
			queryClient.clear();
			previousAccount.current = account?.homeAccountId ?? null;
		}
		if (!account) {
			useAuth.setState(state => ({
				account: null,
				roles: [],
				status: state.status === 'error' ? 'error' : 'signed-out',
			}));
			return;
		}
		if (instance.getActiveAccount()?.homeAccountId !== account.homeAccountId)
			instance.setActiveAccount(account);
		useAuth.setState({ status: 'loading', account, roles: [], message: null });
		const controller = new AbortController();
		axios
			.get('/api/whoami', { signal: controller.signal })
			.then(response => {
				if (controller.signal.aborted) return;
				const roles = response.data.roles;
				if (
					!Array.isArray(roles) ||
					!roles.every(role => typeof role === 'string') ||
					!hasStaffRole(roles)
				) {
					useAuth.setState({
						status: 'forbidden',
						roles: [],
						message:
							'This account has no Sermon Hub staff role. Ask an administrator for access.',
					});
					return;
				}
				useAuth.setState({ status: 'ready', roles, message: null });
			})
			.catch(error => {
				if (controller.signal.aborted) return;
				const forbidden =
					axios.isAxiosError(error) && error.response?.status === 403;
				useAuth.setState({
					status: forbidden ? 'forbidden' : 'reauthenticate',
					roles: [],
					message: forbidden
						? 'This account needs the Sermon Hub API permission and a staff role. Ask an administrator for access.'
						: 'We could not verify your session. Check your connection and sign in again.',
				});
			});
		return () => controller.abort();
	}, [instance, account, inProgress, queryClient]);
	const status = useAuth(state => state.status);
	useEffect(() => {
		if (status !== 'ready' && status !== 'loading') queryClient.clear();
	}, [status, queryClient]);
	return children;
}
