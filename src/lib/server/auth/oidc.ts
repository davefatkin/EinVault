import * as client from 'openid-client';
import { env } from '$env/dynamic/private';

export interface OidcConfig {
	issuerUrl: string;
	clientId: string;
	clientSecret: string | undefined;
	redirectUri: string;
	scopes: string;
}

export function getOidcConfig(): OidcConfig | null {
	const issuerUrl = env.OIDC_ISSUER_URL;
	const clientId = env.OIDC_CLIENT_ID;
	const redirectUri = env.OIDC_REDIRECT_URI;

	if (!issuerUrl || !clientId || !redirectUri) return null;

	return {
		issuerUrl,
		clientId,
		clientSecret: env.OIDC_CLIENT_SECRET || undefined,
		redirectUri,
		scopes: env.OIDC_SCOPES || 'openid profile email'
	};
}

export function getOidcProviderName(): string {
	return env.OIDC_PROVIDER_NAME || 'SSO';
}

export function isOidcEnabled(): boolean {
	return getOidcConfig() !== null;
}

const DISCOVERY_TTL_MS = 60 * 60 * 1000;
let cached: { configuration: client.Configuration; cachedAt: number } | null = null;
let inflight: Promise<client.Configuration> | null = null;

export function discoverOidcClient(): Promise<client.Configuration> {
	if (cached && Date.now() - cached.cachedAt < DISCOVERY_TTL_MS) {
		return Promise.resolve(cached.configuration);
	}
	if (inflight) return inflight;

	const config = getOidcConfig();
	if (!config) return Promise.reject(new Error('OIDC is not configured'));

	inflight = (async () => {
		try {
			const serverUrl = new URL(config.issuerUrl);
			const discovered = config.clientSecret
				? await client.discovery(serverUrl, config.clientId, config.clientSecret)
				: await client.discovery(serverUrl, config.clientId, undefined, client.None());
			cached = { configuration: discovered, cachedAt: Date.now() };
			return discovered;
		} catch (err) {
			console.error('[oidc] discovery failed:', err);
			throw err;
		} finally {
			inflight = null;
		}
	})();

	return inflight;
}

export async function handleCallback(
	config: client.Configuration,
	currentUrl: URL,
	codeVerifier: string,
	expectedState: string,
	expectedNonce: string
): Promise<{ idTokenClaims: client.IDToken; idToken: string; accessToken?: string }> {
	const tokens = await client.authorizationCodeGrant(config, currentUrl, {
		pkceCodeVerifier: codeVerifier,
		expectedState,
		expectedNonce,
		idTokenExpected: true
	});

	const claims = tokens.claims();
	if (!claims) throw new Error('No ID token claims in response');
	if (!tokens.id_token) throw new Error('IdP returned no id_token');

	return {
		idTokenClaims: claims,
		idToken: tokens.id_token,
		accessToken: tokens.access_token
	};
}

export function isAdminGroupsConfigured(): boolean {
	const raw = env.OIDC_ADMIN_GROUPS;
	if (!raw) return false;
	return raw
		.split(',')
		.map((g) => g.trim())
		.some(Boolean);
}

// Returns the role for this OIDC login.
// - If admin groups configured AND user is in one, returns 'admin'.
// - Otherwise clamps the passed role to a non-admin role: keeps 'caretaker'/'member',
//   demotes 'admin' (caller is responsible for skipping the call entirely if admin
//   groups aren't configured and the existing role should be preserved).
export function evaluateRole(
	claims: client.IDToken,
	fallbackRole: string
): 'admin' | 'member' | 'caretaker' {
	const adminGroups = env.OIDC_ADMIN_GROUPS;
	if (adminGroups) {
		const configured = adminGroups
			.split(',')
			.map((g) => g.trim())
			.filter(Boolean);
		if (configured.length > 0) {
			const claimGroups = (claims as Record<string, unknown>)['groups'];
			const userGroups: string[] = Array.isArray(claimGroups)
				? (claimGroups as string[])
				: typeof claimGroups === 'string'
					? [claimGroups]
					: [];
			if (userGroups.some((g) => configured.includes(g))) return 'admin';
		}
	}

	if (fallbackRole === 'caretaker') return 'caretaker';
	return 'member';
}
