import { describe, it, expect } from 'vitest';
import { CARE_ERROR, throwCareError, failCareError } from './care-errors';

describe('care errors', () => {
	it('maps each code to the documented status + key', () => {
		expect(CARE_ERROR.notFound).toEqual({ status: 404, key: 'error.quickLogNotFound' });
		expect(CARE_ERROR.disabled).toEqual({ status: 403, key: 'error.quickLogDisabled' });
		expect(CARE_ERROR.noTargets).toEqual({ status: 400, key: 'error.noValidTargets' });
		expect(CARE_ERROR.noActiveShift).toEqual({ status: 403, key: 'error.noActiveShift' });
		expect(CARE_ERROR.notAssigned).toEqual({ status: 403, key: 'error.notAssignedToCompanion' });
	});

	it('throwCareError throws an HttpError carrying code + localized message', () => {
		try {
			throwCareError('noTargets', 'en');
			expect.unreachable('should have thrown');
		} catch (e) {
			const err = e as { status: number; body: { code: string; message: string } };
			expect(err.status).toBe(400);
			expect(err.body.code).toBe('noTargets');
			expect(err.body.message).toBe('This quick log has no companions you can log for right now.');
		}
	});

	it('failCareError returns a fail() with the given form key', () => {
		const r = failCareError('notFound', 'en', 'quickLogError') as unknown as {
			status: number;
			data: Record<string, string>;
		};
		expect(r.status).toBe(404);
		expect(r.data.quickLogError).toBe('Quick log not found.');
	});

	it('localizes the message for the given locale', () => {
		try {
			throwCareError('disabled', 'de');
			expect.unreachable('should have thrown');
		} catch (e) {
			const err = e as { body: { message: string } };
			expect(err.body.message).toBe('Dieses Schnell-Log ist deaktiviert.');
		}
	});
});
