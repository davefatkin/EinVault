import { OAuth2Server } from 'oauth2-mock-server';
import type { Fake } from './types';

export interface OidcFake extends Fake {
	issuerUrl: string;
	/** Claims merged into every subsequently issued ID token. */
	setClaims(claims: Record<string, unknown>): void;
}

export async function startOidcFake(): Promise<OidcFake> {
	const server = new OAuth2Server();
	await server.issuer.keys.generate('RS256');
	await server.start(0, '127.0.0.1');

	let extraClaims: Record<string, unknown> = {};

	// oauth2-mock-server emits this before signing each token; mutate payload in place.
	// The library automatically round-trips `nonce` from the authorize request into the
	// token payload, so no manual nonce wiring is required.
	server.service.on('beforeTokenSigning', (token: { payload: Record<string, unknown> }) => {
		Object.assign(token.payload, extraClaims);
	});

	const issuerUrl = server.issuer.url!;
	return {
		url: issuerUrl,
		issuerUrl,
		setClaims(claims) {
			extraClaims = claims;
		},
		reset() {
			extraClaims = {};
		},
		stop: () => server.stop()
	};
}
