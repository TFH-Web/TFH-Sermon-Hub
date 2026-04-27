// Login Page, shows a microsoft sign-in card and demo
import { useState } from 'react';
import './LoginPage.css';
import { useNavigate } from 'react-router';

// Scenariios Listed
type DemoScenario =
	| 'Default'
	| 'No Access'
	| 'Suspended'
	| 'Pending Approval'
	| 'Session Expired'
	| 'SSO Error'
	| 'Wrong Account';

// Shape of each scenario's config
interface ScenarioConfig {
	subtitle: string;
	alert: {
		type: 'error' | 'warning';
		title: string;
		body: React.ReactNode;
		// Only SSO will use this
		code?: string;
	} | null;
	primaryBtn: { show: boolean; label?: string; msIcon?: boolean };
	outlineBtn: { show: boolean; label?: string; msIcon?: boolean };
	subtext: React.ReactNode | null;
}

// Config object for every scenario, user chooses a pill to choose a scenario
const SCENARIOS: Record<DemoScenario, ScenarioConfig> = {
	Default: {
		subtitle: 'Sign in with your organization account to continue',
		alert: null,
		primaryBtn: { show: true, label: 'Sign in with Microsoft', msIcon: true },
		outlineBtn: { show: false },
		subtext: 'All access requires a TFH organizational account',
	},

	'No Access': {
		subtitle: 'Access denied',
		alert: {
			type: 'error',
			title: 'Access Denied',
			body: (
				<>
					The account <strong>user@gmail.com</strong> is not authorized to
					access Sermon Hub. Only The Father's House organizational accounts
					(@tfh.org) are permitted.
				</>
			),
		},
		primaryBtn: { show: false },
		outlineBtn: { show: true, label: 'Try a different account', msIcon: true },
		subtext: (
			<>
				Need access? Contact{' '}
				<strong className="subtext-green">it@tfh.org</strong> to request
				provisioning.
			</>
		),
	},

	Suspended: {
		subtitle: 'Account suspended',
		alert: {
			type: 'error',
			title: 'Account Suspended',
			body: 'Your Sermon Hub access has been suspended by an administrator. You cannot sign in until this is resolved.',
		},
		primaryBtn: { show: false },
		outlineBtn: { show: false },
		subtext: (
			<>
				Contact <strong className="subtext-green">it@tfh.org</strong> or your
				system administrator to reinstate your account.
			</>
		),
	},

	'Pending Approval': {
		subtitle: 'Awaiting administrator approval',
		alert: {
			type: 'warning',
			title: 'Approval Pending',
			body: (
				<>
					Your account has been registered but is awaiting administrator
					approval. You'll receive an email at{' '}
					<strong className="subtext-green">user@tfh.org</strong> once access is
					granted.
				</>
			),
		},
		primaryBtn: { show: false },
		outlineBtn: { show: true, label: 'Resend Approval Request', msIcon: false },
		subtext: 'Typical wait time is less than 24 hours.',
	},

	'Session Expired': {
		subtitle: 'Your session has expired',
		alert: {
			type: 'warning',
			title: 'Session Expired',
			body: 'Your session timed out after 8 hours of inactivity. Please sign in again to continue where you left off.',
		},
		primaryBtn: { show: true, label: 'Sign in again', msIcon: true },
		outlineBtn: { show: false },
		subtext: null,
	},

	'SSO Error': {
		subtitle: 'Authentication service unavailable',
		alert: {
			type: 'error',
			title: 'Authentication Unavailable',
			body: "We couldn't reach Microsoft authentication services. This may be a temporary outage.",
			code: 'Error: AADSTS50013 — IdP unreachable',
		},
		primaryBtn: { show: true, label: 'Retry Sign In', msIcon: false },
		outlineBtn: { show: false },
		subtext: (
			<>
				If this persists, contact{' '}
				<strong className="subtext-green">it@tfh.org</strong> or check{' '}
				<strong>Microsoft Service Health</strong>.
			</>
		),
	},

	'Wrong Account': {
		subtitle: 'Incorrect account type',
		alert: {
			type: 'warning',
			title: 'Personal Account Detected',
			body: (
				<>
					You signed in with a personal Microsoft account. Sermon Hub requires a{' '}
					<strong className="subtext-green">
						The Father's House work account
					</strong>{' '}
					ending in @tfh.org.
				</>
			),
		},
		primaryBtn: { show: false },
		outlineBtn: {
			show: true,
			label: 'Sign in with work account',
			msIcon: true,
		},
		subtext: (
			<>
				Don't have one? Contact{' '}
				<strong className="subtext-green">it@tfh.org</strong> to get set up.
			</>
		),
	},
};

// Grabs the keys as an array
const SCENARIO_KEYS = Object.keys(SCENARIOS) as DemoScenario[];

// Component for Microsoft logo until backend is connected and integrated
function MicrosoftIcon() {
	return (
		<svg
			width="18"
			height="18"
			viewBox="0 0 21 21"
			fill="none"
			aria-label="Microsoft logo"
		>
			<title>Microsoft logo</title>
			<rect x="1" y="1" width="9" height="9" fill="#F25022" />
			<rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
			<rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
			<rect x="11" y="11" width="9" height="9" fill="#FFB900" />
		</svg>
	);
}

// Main page
export default function LoginPage() {
	const navigate = useNavigate();

	const [scenario, setScenario] = useState<DemoScenario>('Default');

	// Current Scenario config
	const s = SCENARIOS[scenario];

	// TODO: Replace with MSAL redirect when authentication gets wired
	function handlePrimaryClick() {
		alert(`[Demo] Outline action triggered - scenario: "${scenario}"`);
		navigate('/');
	}

	// TODO: Wire to MSAL account picker or resend the approval logic
	function handleOutlineClick() {
		alert(`[Demo] Outline action triggered — scenario: "${scenario}"`);
	}

	return (
		// Gray fullscreen background, the card is centered in the middle
		<div className="login-page">
			<div className="login-card">
				{/* The Demo Scenario Bar */}
				<div className="demo-bar">
					<p className="demo-label">Demo Scenario</p>

					{/* Loops over each scenario and creates a pill button to simulate each */}
					<div className="demo-pills">
						{SCENARIO_KEYS.map(key => (
							<button
								key={key}
								type="button"
								className={`demo-pill ${scenario === key ? 'active' : ''}`}
								onClick={() => setScenario(key)}
							>
								{key}
							</button>
						))}
					</div>
				</div>

				{/* Card Bodies */}
				<div className="login-body">
					{/* TFH logo */}
					<div className="tfh-badge">TFH</div>

					{/* The title and subtitle, subtitle will change with each scenario */}
					<h1 className="login-title">Sermon Hub</h1>
					<p className="login-subtitle">{s.subtitle}</p>

					{/* Aler box for when the scenario has an alert */}
					{s.alert && (
						<div className={`alert-box alert-${s.alert.type}`}>
							<p className="alert-title">{s.alert.title}</p>
							<p className="alert-body">{s.alert.body}</p>
							{/* Shows when the SSO error occurs */}
							{s.alert.code && <p className="alert-code">{s.alert.code}</p>}
						</div>
					)}

					{/* Primary button, the green filled */}
					{s.primaryBtn.show && (
						<button
							type="button"
							className="btn-primary"
							onClick={handlePrimaryClick}
						>
							{s.primaryBtn.msIcon && <MicrosoftIcon />}
							{s.primaryBtn.label}
						</button>
					)}

					{/* Outline button */}
					{s.outlineBtn.show && (
						<button
							type="button"
							className="btn-outline"
							onClick={handleOutlineClick}
						>
							{s.outlineBtn.msIcon && <MicrosoftIcon />}
							{s.outlineBtn.label}
						</button>
					)}

					{/* The subtext underneath the buttons, null renders nothing */}
					{s.subtext && <p className="login-subtext">{s.subtext}</p>}
				</div>

				{/* Footer */}
				<div className="login-footer">
					<p>The Father's House — Sermon Hub Portal</p>
					<p>Protected by Microsoft Entra SSO</p>
				</div>
			</div>
		</div>
	);
}
