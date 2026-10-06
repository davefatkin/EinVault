import { describe, it, expect } from 'vitest';
import { noteMediaUrl, toMediaItem } from './media';

const base = {
	id: 'm1',
	filename: 'm1.jpg',
	originalName: 'dog.jpg',
	mediaType: 'photo' as const,
	posterKey: null,
	loggedBy: 'u1'
};

describe('toMediaItem', () => {
	it('maps a note media row with a caption', () => {
		expect(
			toMediaItem({
				...base,
				caption: 'sit',
				status: 'processing',
				logger: { displayName: 'Jet' }
			})
		).toEqual({
			...base,
			caption: 'sit',
			status: 'processing',
			logger: { displayName: 'Jet' }
		});
	});

	it('maps a journal row, taking the caption from notes', () => {
		expect(toMediaItem({ ...base, notes: 'paw', status: 'ready', logger: null })).toMatchObject({
			caption: 'paw',
			logger: null
		});
	});

	it('defaults status to ready and logger and caption to null', () => {
		expect(toMediaItem(base)).toEqual({
			...base,
			caption: null,
			status: 'ready',
			logger: null
		});
	});

	it('drops fields outside MediaItem', () => {
		const row = { ...base, caption: null, noteId: 'n1', storageKey: 'notes/c/n/m1.jpg' };
		expect(Object.keys(toMediaItem(row))).not.toContain('noteId');
		expect(Object.keys(toMediaItem(row))).not.toContain('storageKey');
	});
});

describe('noteMediaUrl', () => {
	it('builds the serving URL', () => {
		expect(noteMediaUrl('c1', 'n1', { filename: 'm1.jpg' })).toBe('/api/photos/notes/c1/n1/m1.jpg');
	});
});
