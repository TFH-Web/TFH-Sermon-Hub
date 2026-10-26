import { InteractionStatus } from '@azure/msal-browser';
import { useMsal } from '@azure/msal-react';
import { useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { apiScopes } from './authConfig';
import ErrorBox from './components/ErrorBox';
import { safeReturnPath, useAuth } from './lib/auth';
import './LoginPage.css';

export default function LoginPage() {
	const { instance, inProgress } = useMsal();
	const { status, message } = useAuth();
	const location = useLocation();
	const returnTo = safeReturnPath(location.state?.returnTo);
	const [error, setError] = useState<string | null>(null);
	const [starting, setStarting] = useState(false);
	const busy = starting || inProgress !== InteractionStatus.None;

	async function signIn(selectAccount = false) {
		if (busy) return;
		setError(null);
		if (!apiScopes.length) {
			setError(
				'API access is not configured. Contact the application administrator.',
			);
			return;
		}
		setStarting(true);
		try {
			await instance.loginRedirect({
				scopes: apiScopes,
				prompt: selectAccount ? 'select_account' : undefined,
				redirectStartPage: new URL(returnTo, window.location.origin).href,
			});
		} catch {
			setError(
				'Microsoft sign-in failed. Please try again or choose another account.',
			);
		} finally {
			setStarting(false);
		}
	}

	if (status === 'ready' && !busy) return <Navigate to={returnTo} replace />;
	return (
		<main className="login-page">
			<div className="login-card">
				<div className="login-body">
					<div className="tfh-badge">TFH</div>
					<h1 className="login-title">Sermon Hub</h1>
					<p className="login-subtitle">
						Sign in with your authorized staff account to continue.
					</p>
					{(error || message) && (
						<ErrorBox message={error || message || undefined} />
					)}
					<button
						type="button"
						className="btn-primary"
						disabled={busy}
						onClick={() => void signIn()}
					>
						{busy
							? 'Signing in…'
							: status === 'reauthenticate'
								? 'Sign in again'
								: 'Sign in with Microsoft'}
					</button>
					<button
						type="button"
						className="btn-outline"
						disabled={busy}
						onClick={() => void signIn(true)}
					>
						Use a different account
					</button>
					{busy && <p role="status">Connecting to Microsoft…</p>}
					<p className="login-subtext">
						Need access? Contact your TFH administrator to have a staff role
						assigned.
					</p>
				</div>
				<div className="login-footer">
					<p>The Father's House — Sermon Hub Portal</p>
					<p>Protected by Microsoft Entra SSO</p>
				</div>
			</div>
		</main>
	);
}
