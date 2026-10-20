import { describe, it, expect } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import {
	SYNTHETIC_PROTO_HEADER,
	SYNTHETIC_HOST_HEADER,
	parseOrigin,
	applyOriginEnv,
	applyOriginHeaders,
	isValidRequestTarget,
	needsApiContentType
} from '../serve-origin.js';

describe('parseOrigin', () => {
	it('returns null when ORIGIN is unset', () => {
		expect(parseOrigin(undefined)).toBeNull();
	});

	it.each([
		['http://localhost:3000', 'http://localhost:3000', 'http', 'localhost:3000'],
		[
			'https://einvault.example.com',
			'https://einvault.example.com',
			'https',
			'einvault.example.com'
		],
		[
			'https://einvault.example.com/',
			'https://einvault.example.com',
			'https',
			'einvault.example.com'
		],
		[
			'https://einvault.example.com:443',
			'https://einvault.example.com',
			'https',
			'einvault.example.com'
		],
		['http://10.0.0.5:8080', 'http://10.0.0.5:8080', 'http', '10.0.0.5:8080'],
		[
			'HTTPS://EinVault.Example.com:8443',
			'https://einvault.example.com:8443',
			'https',
			'einvault.example.com:8443'
		]
	])('parses %s', (raw, origin, proto, host) => {
		expect(parseOrigin(raw)).toEqual({ origin, proto, host, warnings: [] });
	});

	it.each([
		'https://einvault.example.com/app',
		'https://einvault.example.com/?x=1',
		'https://einvault.example.com/#top',
		'https://user:secret@einvault.example.com'
	])('reduces %s to its origin with one warning', (raw) => {
		const parsed = parseOrigin(raw);
		expect(parsed?.origin).toBe('https://einvault.example.com');
		expect(parsed?.warnings).toHaveLength(1);
		expect(parsed?.warnings[0]).not.toContain('secret');
	});

	it.each([
		'',
		'   ',
		'einvault.example.com',
		'localhost:3000',
		'not a url',
		'ftp://einvault.example.com',
		'file:///etc/passwd',
		'javascript:alert(1)'
	])('rejects %j', (raw) => {
		expect(() => parseOrigin(raw)).toThrow(/ORIGIN/);
	});
});

describe('applyOriginEnv', () => {
	const parsed = parseOrigin('HTTPS://EinVault.Example.com:443/')!;

	it('points the adapter at the synthetic headers and writes the canonical ORIGIN', () => {
		const env: Record<string, string | undefined> = { ORIGIN: 'HTTPS://EinVault.Example.com:443/' };
		expect(applyOriginEnv(env, parsed)).toEqual([]);
		expect(env).toEqual({
			ORIGIN: 'https://einvault.example.com',
			PROTOCOL_HEADER: SYNTHETIC_PROTO_HEADER,
			HOST_HEADER: SYNTHETIC_HOST_HEADER
		});
	});

	it('overrides operator header vars and reports them', () => {
		const env: Record<string, string | undefined> = {
			ORIGIN: 'https://einvault.example.com',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			HOST_HEADER: 'x-forwarded-host',
			PORT_HEADER: 'x-forwarded-port'
		};
		expect(applyOriginEnv(env, parsed)).toEqual(['PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER']);
		expect(env.PROTOCOL_HEADER).toBe(SYNTHETIC_PROTO_HEADER);
		expect(env.HOST_HEADER).toBe(SYNTHETIC_HOST_HEADER);
		expect('PORT_HEADER' in env).toBe(false);
	});

	it('does not report empty operator vars', () => {
		const env: Record<string, string | undefined> = { PROTOCOL_HEADER: '', PORT_HEADER: '' };
		expect(applyOriginEnv(env, parsed)).toEqual([]);
		expect('PORT_HEADER' in env).toBe(false);
	});
});

describe('applyOriginHeaders', () => {
	it('overwrites client-supplied copies and leaves Host alone', () => {
		const headers: IncomingHttpHeaders = {
			host: 'evil.test',
			[SYNTHETIC_PROTO_HEADER]: 'https',
			[SYNTHETIC_HOST_HEADER]: 'evil.test, other.test'
		};
		applyOriginHeaders(headers, parseOrigin('http://localhost:3000')!);
		expect(headers[SYNTHETIC_PROTO_HEADER]).toBe('http');
		expect(headers[SYNTHETIC_HOST_HEADER]).toBe('localhost:3000');
		expect(headers.host).toBe('evil.test');
	});

	it('sets the headers when the client sent none, without a default port', () => {
		const headers: IncomingHttpHeaders = {};
		applyOriginHeaders(headers, parseOrigin('https://einvault.example.com:443')!);
		expect(headers).toEqual({
			[SYNTHETIC_PROTO_HEADER]: 'https',
			[SYNTHETIC_HOST_HEADER]: 'einvault.example.com'
		});
	});
});

describe('isValidRequestTarget', () => {
	it.each([
		['/', 'GET', true],
		['/auth/login?x=1', 'POST', true],
		['//evil.test/x', 'GET', true],
		['*', 'OPTIONS', true],
		['*', 'GET', false],
		['http://evil.test/x', 'GET', false],
		['auth/login', 'GET', false],
		['', 'GET', false],
		[undefined, 'GET', false]
	])('%j with %s is %s', (target, method, expected) => {
		expect(isValidRequestTarget(target, method)).toBe(expected);
	});
});

describe('needsApiContentType', () => {
	const bearer = { authorization: 'Bearer evk_abc' };

	it.each<[string | undefined, IncomingHttpHeaders, boolean]>([
		['/api/quick-logs/q1/execute', bearer, true],
		['/api/notes/n1', { authorization: 'bearer evk_abc' }, true],
		['/api/notes/n1', { ...bearer, 'content-type': '' }, true],
		['/api/notes/n1', { ...bearer, 'content-type': 'application/json' }, false],
		['/api/notes/n1', { authorization: 'Basic Zm9vOmJhcg==' }, false],
		['/api/notes/n1', { authorization: 'Bearer' }, false],
		['/api/notes/n1', {}, false],
		['/settings?/save', bearer, false],
		['/apix/notes', bearer, false],
		['/api/../auth/login', bearer, false],
		['//evil.test/api/notes', bearer, false],
		[undefined, bearer, false]
	])('%j %j is %s', (target, headers, expected) => {
		expect(needsApiContentType(target, headers)).toBe(expected);
	});
});
