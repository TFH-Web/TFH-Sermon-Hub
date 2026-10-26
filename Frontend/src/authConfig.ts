import type { Configuration } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';

const msalConfig: Configuration = {
	// Auth configuration
	auth: {
		clientId: import.meta.env.VITE_CLIENT_ID,
		authority: `https://login.microsoftonline.com/${import.meta.env.VITE_TENANT_ID}`,
		redirectUri: import.meta.env.VITE_REDIRECT_URI,
		postLogoutRedirectUri: import.meta.env.VITE_REDIRECT_URI,
	},
	// Cache configuration
	cache: {
		cacheLocation: 'sessionStorage',
	},
};

export const msalInstance = new PublicClientApplication(msalConfig);

// Our exposed delegated API scope, not Graph/openid/profile.
export const apiScopes: string[] = (import.meta.env.VITE_API_SCOPE || '')
	.split(/\s+/)
	.filter(Boolean);
