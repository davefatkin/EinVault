import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCelebrationRows, celebrationLines, CELEBRATION_HOUR } from './celebrations';
import { buildCelebrationEmail } from '#lib/server/mail/templates.js';
import type { Recipient } from './outbox';

const ein = {
	id: 'c-ein',
	dob: '2018-04-10',
	dobApproximate: false,
	homecomingDate: '2019-04-14',
	isActive: true
};

const admin: Recipient = {
	id: 'u-admin',
	role: 'admin',
	email: 'admin@example.com',
	ntfyTopic: 'admin-topic',
	flag: true
};
const member: Recipient = {
	id: 'u-member',
	role: 'member',
	email: 'member@example.com',
	ntfyTopic: 'member-topic',
	flag: false
};
const caretaker: Recipient = {
	id: 'u-care',
	role: 'caretaker',
	email: 'care@example.com',
	ntfyTopic: 'care-topic',
	flag: true
};

const both = { mailOn: true, ntfyOn: true };

describe('buildCelebrationRows', () => {
	let savedTz: string | undefined;
	beforeEach(() => {
		savedTz = process.env.TZ;
		process.env.TZ = 'UTC';
	});
	afterEach(() => {
		if (savedTz === undefined) delete process.env.TZ;
		else process.env.TZ = savedTz;
	});

	it('waits until 09:00 household time', () => {
		expect(CELEBRATION_HOUR).toBe(9);
		expect(buildCelebrationRows([ein], [admin], new Date(2026, 3, 10, 8, 59), both)).toEqual([]);
		expect(buildCelebrationRows([ein], [admin], new Date(2026, 3, 10, 9, 0), both)).toHaveLength(2);
	});

	it('picks channels per recipient and skips caretakers', () => {
		const rows = buildCelebrationRows(
			[ein],
			[admin, member, caretaker],
			new Date(2026, 3, 10, 9, 0),
			both
		);
		expect(rows.map((r) => `${r.userId}:${r.channel}`).sort()).toEqual([
			'u-admin:email',
			'u-admin:ntfy',
			'u-member:ntfy'
		]);
	});

	it('emits no email rows when mail is off', () => {
		const rows = buildCelebrationRows([ein], [admin], new Date(2026, 3, 10, 12, 0), {
			mailOn: false,
			ntfyOn: true
		});
		expect(rows.map((r) => r.channel)).toEqual(['ntfy']);
	});

	it('skips inactive companions and approximate-dob birthdays', () => {
		const now = new Date(2026, 3, 10, 12, 0);
		expect(buildCelebrationRows([{ ...ein, isActive: false }], [admin], now, both)).toEqual([]);
		expect(buildCelebrationRows([{ ...ein, dobApproximate: true }], [admin], now, both)).toEqual(
			[]
		);
	});

	it('keys birthday and homecoming in the same year apart', () => {
		const bday = buildCelebrationRows([ein], [admin], new Date(2026, 3, 10, 12, 0), both);
		const home = buildCelebrationRows([ein], [admin], new Date(2026, 3, 14, 12, 0), both);
		expect(bday).toHaveLength(2);
		expect(home).toHaveLength(2);
		const keys = new Set([...bday, ...home].map((r) => r.dedupeKey));
		expect(keys.size).toBe(4);
		expect(bday[0].dedupeKey).toBe('celebration:c-ein:2026-04-10:u-admin:email');
	});

	it('carries ids and date only in the payload', () => {
		const [row] = buildCelebrationRows([ein], [admin], new Date(2026, 3, 14, 12, 0), both);
		expect(row.payload).toEqual({ kind: 'celebration', companionId: 'c-ein', date: '2026-04-14' });
	});
});

describe('celebrationLines', () => {
	it('renders birthday then homecoming', () => {
		expect(celebrationLines('en', 'Ein', { birthdayYears: 8, homecomingYears: 7 })).toEqual([
			'🎂 Ein turns 8 today!',
			"🏡 Ein's homecoming day: 7 years home!"
		]);
	});

	it('uses the singular homecoming line for one year', () => {
		expect(celebrationLines('en', 'Ein', { homecomingYears: 1 })).toEqual([
			"🏡 Ein's homecoming day: 1 year home!"
		]);
	});
});

describe('buildCelebrationEmail', () => {
	it('renders subject, lines, and link', () => {
		const msg = buildCelebrationEmail(
			'en',
			{ displayName: 'Spike', email: 'spike@example.com' },
			'Ein',
			{ birthdayYears: 8, homecomingYears: 7 },
			'https://vault.example/c-ein'
		);
		expect(msg.to).toBe('spike@example.com');
		expect(msg.subject).toBe('Ein is celebrating today');
		expect(msg.text).toContain('🎂 Ein turns 8 today!');
		expect(msg.text).toContain("🏡 Ein's homecoming day: 7 years home!");
		expect(msg.text).toContain('https://vault.example/c-ein');
		expect(msg.html).toContain('https://vault.example/c-ein');
	});

	it('escapes the companion name in html', () => {
		const msg = buildCelebrationEmail(
			'en',
			{ displayName: 'Spike', email: 'spike@example.com' },
			'<b>Ein</b>',
			{ birthdayYears: 8 },
			null
		);
		expect(msg.html).toContain('&lt;b&gt;Ein&lt;/b&gt;');
		expect(msg.html).not.toContain('<b>Ein</b>');
		expect(msg.html).not.toContain('<a href');
	});
});
