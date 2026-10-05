import { describe, it, expect } from 'vitest';
import { ownerRouteDecision } from './route-guard';

const admin = { role: 'admin' as const };
const member = { role: 'member' as const };
const caretaker = { role: 'caretaker' as const };

const HEALTH = '/(app)/(companion)/[companionId]/health';
const ADMIN_COMPANIONS = '/(app)/(admin)/admin/companions';

describe('ownerRouteDecision', () => {
	it('leaves reads to the layout loads', () => {
		for (const method of ['GET', 'HEAD']) {
			expect(ownerRouteDecision(method, HEALTH, caretaker)).toBe('allow');
			expect(ownerRouteDecision(method, ADMIN_COMPANIONS, null)).toBe('allow');
		}
	});

	it('rejects writes to owner routes without a session', () => {
		expect(ownerRouteDecision('POST', HEALTH, null)).toBe('unauthenticated');
		expect(ownerRouteDecision('POST', ADMIN_COMPANIONS, null)).toBe('unauthenticated');
	});

	it('rejects caretaker writes to owner routes', () => {
		expect(ownerRouteDecision('POST', HEALTH, caretaker)).toBe('forbidden');
		expect(ownerRouteDecision('POST', '/(app)', caretaker)).toBe('forbidden');
		expect(ownerRouteDecision('POST', ADMIN_COMPANIONS, caretaker)).toBe('forbidden');
	});

	it('treats every non-read method as a write', () => {
		for (const method of ['PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
			expect(ownerRouteDecision(method, HEALTH, caretaker)).toBe('forbidden');
			expect(ownerRouteDecision(method, HEALTH, null)).toBe('unauthenticated');
		}
	});

	it('allows member and admin writes to owner routes', () => {
		expect(ownerRouteDecision('POST', HEALTH, member)).toBe('allow');
		expect(ownerRouteDecision('POST', HEALTH, admin)).toBe('allow');
	});

	it('restricts writes under the admin group to admins', () => {
		expect(ownerRouteDecision('POST', ADMIN_COMPANIONS, member)).toBe('forbidden');
		expect(ownerRouteDecision('POST', ADMIN_COMPANIONS, admin)).toBe('allow');
	});

	it('ignores routes outside the owner group', () => {
		for (const route of [
			'/(caretaker)/care/[companionId]',
			'/api/notes',
			'/auth/login',
			'/setup',
			'/(app)-lookalike',
			null
		]) {
			expect(ownerRouteDecision('POST', route, null)).toBe('allow');
			expect(ownerRouteDecision('POST', route, caretaker)).toBe('allow');
		}
	});
});
