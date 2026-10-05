import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { routeGroupDecision } from './route-guard';

const admin = { role: 'admin' as const };
const member = { role: 'member' as const };
const caretaker = { role: 'caretaker' as const };

const HEALTH = '/(app)/(companion)/[companionId]/health';
const ADMIN_COMPANIONS = '/(app)/(admin)/admin/companions';
const CARE = '/(caretaker)/care/[companionId]';
const CARE_SETTINGS = '/(caretaker)/care/settings';

describe('routeGroupDecision', () => {
	it('leaves reads to the layout loads', () => {
		for (const method of ['GET', 'HEAD']) {
			expect(routeGroupDecision(method, HEALTH, caretaker)).toBe('allow');
			expect(routeGroupDecision(method, ADMIN_COMPANIONS, null)).toBe('allow');
			expect(routeGroupDecision(method, CARE, member)).toBe('allow');
		}
	});

	it('rejects writes to owner routes without a session', () => {
		expect(routeGroupDecision('POST', HEALTH, null)).toBe('unauthenticated');
		expect(routeGroupDecision('POST', ADMIN_COMPANIONS, null)).toBe('unauthenticated');
	});

	it('rejects caretaker writes to owner routes', () => {
		expect(routeGroupDecision('POST', HEALTH, caretaker)).toBe('forbidden');
		expect(routeGroupDecision('POST', '/(app)', caretaker)).toBe('forbidden');
		expect(routeGroupDecision('POST', ADMIN_COMPANIONS, caretaker)).toBe('forbidden');
	});

	it('treats every non-read method as a write', () => {
		for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
			expect(routeGroupDecision(method, HEALTH, caretaker)).toBe('forbidden');
			expect(routeGroupDecision(method, HEALTH, null)).toBe('unauthenticated');
			expect(routeGroupDecision(method, CARE, member)).toBe('forbidden');
			expect(routeGroupDecision(method, CARE, null)).toBe('unauthenticated');
		}
	});

	it('allows member and admin writes to owner routes', () => {
		expect(routeGroupDecision('POST', HEALTH, member)).toBe('allow');
		expect(routeGroupDecision('POST', HEALTH, admin)).toBe('allow');
	});

	it('restricts writes under the admin group to admins', () => {
		expect(routeGroupDecision('POST', ADMIN_COMPANIONS, member)).toBe('forbidden');
		expect(routeGroupDecision('POST', ADMIN_COMPANIONS, admin)).toBe('allow');
	});

	it('restricts writes under the caretaker group to caretakers', () => {
		for (const route of [CARE, CARE_SETTINGS, '/(caretaker)']) {
			expect(routeGroupDecision('POST', route, null)).toBe('unauthenticated');
			expect(routeGroupDecision('POST', route, member)).toBe('forbidden');
			expect(routeGroupDecision('POST', route, admin)).toBe('forbidden');
			expect(routeGroupDecision('POST', route, caretaker)).toBe('allow');
		}
	});

	it('ignores routes outside the guarded groups', () => {
		for (const route of [
			'/api/notes',
			'/auth/login',
			'/setup',
			'/(app)-lookalike',
			'/(caretaker)-lookalike',
			null
		]) {
			expect(routeGroupDecision('POST', route, null)).toBe('allow');
			expect(routeGroupDecision('POST', route, caretaker)).toBe('allow');
			expect(routeGroupDecision('POST', route, member)).toBe('allow');
		}
	});
});

const SRC_DIR = fileURLToPath(new URL('../../../', import.meta.url));
const ROUTES_DIR = join(SRC_DIR, 'routes');

function listFiles(dir: string): string[] {
	return readdirSync(dir, { recursive: true }).map((f) => String(f).split(sep).join('/'));
}

// Form actions the route-group guard does not cover on purpose. Each one runs
// for signed-out users or for any role and does its own checks.
const UNGUARDED_ACTION_ROUTES: Record<string, string> = {
	'/setup': 'first-run wizard, runs before any user exists',
	'/auth/login': 'signed-out flow',
	'/auth/logout': 'any signed-in role',
	'/auth/forgot': 'signed-out flow',
	'/auth/reset': 'signed-out flow, authorized by the reset token',
	'/auth/2fa': 'second login step, before a session exists',
	'/2fa-setup': 'forced enrollment for any role'
};

// Matches `export const actions`, `export function actions` and re-exports such
// as `export { quickLogActions as actions } from ...`. A star re-export counts
// too, since it may carry actions; a false match only fails loudly.
const EXPORTS_ACTIONS =
	/^export\s+(?:const|let|var|function|async\s+function)\s+actions\b|^export\s*\{[^}]*\bactions\b[^}]*\}|^export\s*\*\s*from\b/m;

function routesWithActions(): string[] {
	return listFiles(ROUTES_DIR)
		.filter((f) => /^\+page\.server\.[jt]s$/.test(basename(f)))
		.filter((f) => EXPORTS_ACTIONS.test(readFileSync(join(ROUTES_DIR, f), 'utf8')))
		.map((f) => (dirname(f) === '.' ? '/' : '/' + dirname(f)));
}

describe('form actions stay inside guarded route groups', () => {
	const routes = routesWithActions();

	it('finds direct and re-exported actions', () => {
		expect(routes).toContain('/(app)/(companion)/[companionId]/health');
		expect(routes).toContain('/(caretaker)/care/settings/quick-logs');
	});

	it('guards every route with form actions unless allowlisted', () => {
		const unguarded = routes.filter(
			(id) => !(id in UNGUARDED_ACTION_ROUTES) && routeGroupDecision('POST', id, null) === 'allow'
		);
		expect(
			unguarded,
			'These routes export form actions outside the (app) and (caretaker) groups, so ' +
				'hooks.server.ts enforces no role on them. Move them into a guarded group, or add ' +
				'them to UNGUARDED_ACTION_ROUTES with a reason if they must stay public.'
		).toEqual([]);
	});

	it('has no stale allowlist entries', () => {
		const stale = Object.keys(UNGUARDED_ACTION_ROUTES).filter((id) => !routes.includes(id));
		expect(stale).toEqual([]);
	});
});

describe('remote functions', () => {
	// The route-group guard keys on event.route.id, which a /_app/remote call
	// takes from a client-supplied header. See the note on routeGroupGuard in
	// hooks.server.ts before adopting them, then update this test.
	it('are not in use', () => {
		const remoteFiles = listFiles(SRC_DIR).filter((f) => /\.remote\.[jt]s$/.test(f));
		expect(remoteFiles).toEqual([]);
		const config = readFileSync(join(SRC_DIR, '../svelte.config.js'), 'utf8');
		expect(config).not.toMatch(/remoteFunctions/);
	});
});
