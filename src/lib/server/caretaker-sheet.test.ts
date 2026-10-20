import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '#lib/server/db/index.js';
import { loadCaretakerSheet, formatPrintedOn } from './caretaker-sheet';

const FULL = 'cs-full';
const BARE = 'cs-bare';
const OTHER = 'cs-other';
const JET = 'cs-jet';

async function addNote(
	id: string,
	companionId: string,
	shared: boolean,
	extra: Partial<typeof schema.notes.$inferInsert> = {}
) {
	await db.insert(schema.notes).values({
		id,
		companionId,
		title: `Title ${id}`,
		body: `Body ${id}`,
		sharedWithCaretakers: shared,
		loggedBy: JET,
		updatedBy: JET,
		...extra
	});
}

async function addMedia(
	id: string,
	noteId: string,
	extra: Partial<typeof schema.media.$inferInsert> = {}
) {
	await db.insert(schema.media).values({
		id,
		noteId,
		filename: `${id}.jpg`,
		storageKey: `notes/x/${noteId}/${id}.jpg`,
		mimeType: 'image/jpeg',
		sizeBytes: 1,
		loggedBy: JET,
		...extra
	});
}

beforeAll(async () => {
	await db.insert(schema.users).values([
		{ id: JET, username: JET, displayName: 'Jet', role: 'member', phone: ' (555) 010-7402 ' },
		{
			id: 'cs-spike',
			username: 'cs-spike',
			displayName: 'Spike',
			role: 'admin',
			phone: '   ',
			email: 'spike@example.com'
		},
		{ id: 'cs-ed', username: 'cs-ed', displayName: 'Ed', role: 'member' },
		{
			id: 'cs-faye',
			username: 'cs-faye',
			displayName: 'Faye',
			role: 'caretaker',
			phone: '555-0613'
		},
		{
			id: 'cs-vicious',
			username: 'cs-vicious',
			displayName: 'Vicious',
			role: 'member',
			phone: '555-3417',
			isActive: false
		}
	] as (typeof schema.users.$inferInsert)[]);
	await db.insert(schema.companions).values([
		{
			id: FULL,
			name: 'Ein',
			species: 'dog',
			breed: ' Corgi ',
			sex: 'male',
			dob: '2022-03-15',
			microchip: '981020012345678',
			avatarPath: 'avatars/ein.jpg',
			feedingSchedule: 'Half cup at 7am.',
			walkSchedule: '  ',
			medicationSchedule: '**Heartworm** monthly.',
			vetName: 'Dr. Bacchus',
			vetClinic: '',
			vetPhone: '(555) 287-3300',
			emergencyContactName: 'Annie',
			emergencyContactPhone: ' (555) 010-1979 '
		},
		{
			id: BARE,
			name: 'Julia',
			species: 'cat',
			vetName: ' ',
			vetClinic: '\t',
			emergencyContactName: '  ',
			emergencyContactPhone: ''
		},
		{ id: OTHER, name: 'Edward' }
	]);
	await db.insert(schema.weightEntries).values([
		{
			id: 'cs-w-old',
			companionId: FULL,
			weight: 24,
			unit: 'lbs',
			recordedAt: new Date(2026, 0, 1)
		},
		{
			id: 'cs-w-new',
			companionId: FULL,
			weight: 25.5,
			unit: 'lbs',
			recordedAt: new Date(2026, 5, 1)
		}
	]);
	await addNote('cs-n-shared', FULL, true, { pinned: true });
	await db.insert(schema.noteTags).values([
		{ noteId: 'cs-n-shared', tag: 'sitter' },
		{ noteId: 'cs-n-shared', tag: 'food' }
	]);
	await addMedia('cs-m-ready', 'cs-n-shared', { originalName: 'bowl.jpg', caption: 'His bowl' });
	await addMedia('cs-m-processing', 'cs-n-shared', {
		mediaType: 'video',
		mimeType: 'video/mp4',
		status: 'processing'
	});
	await addMedia('cs-m-video', 'cs-n-shared', { mediaType: 'video', mimeType: 'video/mp4' });
	await addNote('cs-n-private', FULL, false);
	await addMedia('cs-m-private', 'cs-n-private');
	await addNote('cs-n-other', OTHER, true);
});

describe('loadCaretakerSheet', () => {
	it('maps a full companion to exactly the sheet fields', async () => {
		const sheet = (await loadCaretakerSheet(FULL))!;
		expect(Object.keys(sheet).sort()).toEqual([
			'companion',
			'emergency',
			'latestWeight',
			'notes',
			'owners',
			'schedules',
			'vet'
		]);
		expect(sheet.companion).toEqual({
			id: FULL,
			name: 'Ein',
			species: 'dog',
			breed: 'Corgi',
			sex: 'male',
			dob: '2022-03-15',
			microchip: '981020012345678',
			avatarPath: 'avatars/ein.jpg'
		});
		expect(sheet.schedules).toEqual({
			feeding: 'Half cup at 7am.',
			walk: null,
			medication: '**Heartworm** monthly.'
		});
		expect(sheet.vet).toEqual({ name: 'Dr. Bacchus', clinic: null, phone: '(555) 287-3300' });
		expect(sheet.emergency).toEqual({ name: 'Annie', phone: '(555) 010-1979' });
	});

	it('treats empty and whitespace-only fields as missing', async () => {
		const sheet = (await loadCaretakerSheet(BARE))!;
		expect(sheet.companion).toMatchObject({
			breed: null,
			sex: null,
			dob: null,
			microchip: null,
			avatarPath: null
		});
		expect(sheet.schedules).toEqual({ feeding: null, walk: null, medication: null });
		expect(sheet.vet).toBeNull();
		expect(sheet.emergency).toBeNull();
		expect(sheet.latestWeight).toBeNull();
		expect(sheet.notes).toEqual([]);
	});

	it('uses the newest weight entry', async () => {
		expect((await loadCaretakerSheet(FULL))!.latestWeight).toEqual({
			weight: 25.5,
			unit: 'lbs',
			recordedAt: new Date(2026, 5, 1)
		});
	});

	it('returns only shared notes, with only the sheet fields and ready media', async () => {
		const { notes } = (await loadCaretakerSheet(FULL))!;
		expect(notes.map((n) => n.id)).toEqual(['cs-n-shared']);
		const [note] = notes;
		expect(Object.keys(note).sort()).toEqual(['body', 'id', 'media', 'pinned', 'tags', 'title']);
		expect(note).toMatchObject({
			title: 'Title cs-n-shared',
			body: 'Body cs-n-shared',
			pinned: true,
			tags: ['food', 'sitter']
		});
		expect(note.media.map((m) => m.id)).toEqual(['cs-m-ready', 'cs-m-video']);
		// toEqual is exact: no loggedBy, logger, status or posterKey.
		expect(note.media[0]).toEqual({
			id: 'cs-m-ready',
			filename: 'cs-m-ready.jpg',
			originalName: 'bowl.jpg',
			mediaType: 'photo',
			caption: 'His bowl'
		});
	});

	it('lists active members and admins with a phone or email, never caretakers', async () => {
		expect((await loadCaretakerSheet(FULL))!.owners).toEqual([
			{ id: JET, displayName: 'Jet', phone: '(555) 010-7402', email: null },
			{ id: 'cs-spike', displayName: 'Spike', phone: null, email: 'spike@example.com' }
		]);
	});

	it('is null for an unknown companion', async () => {
		expect(await loadCaretakerSheet('cs-missing')).toBeNull();
	});
});

describe('formatPrintedOn', () => {
	it('formats a long date in the given locale', () => {
		const at = new Date(2026, 9, 12, 12, 0);
		expect(formatPrintedOn('en', at)).toBe('October 12, 2026');
		expect(formatPrintedOn('fr', at)).toBe('12 octobre 2026');
	});
});
