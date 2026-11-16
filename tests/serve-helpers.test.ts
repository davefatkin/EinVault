import { describe, it, expect } from 'vitest';
import type { IncomingHttpHeaders } from 'node:http';
import { SESSION_COOKIE_NAME as APP_SESSION_COOKIE_NAME } from '#lib/server/auth/session.js';
import {
	isValidRequestTarget,
	needsApiContentType,
	SESSION_COOKIE_NAME
} from '../serve-helpers.js';

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
		['/api/notes/n1', { ...bearer, cookie: 'einvault_session=x' }, false],
		['/api/notes/n1', { ...bearer, cookie: 'a=b; einvault_session=x' }, false],
		['/api/notes/n1', { ...bearer, cookie: 'einvault_locale=en' }, true],
		['/api/notes/n1', { ...bearer, cookie: 'other_einvault_session=x' }, true],
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

describe('SESSION_COOKIE_NAME', () => {
	it('matches the name the app sets', () => {
		expect(SESSION_COOKIE_NAME).toBe(APP_SESSION_COOKIE_NAME);
	});
});
