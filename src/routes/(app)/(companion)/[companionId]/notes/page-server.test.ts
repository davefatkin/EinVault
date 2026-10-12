import { describe, it, expect, beforeAll } from 'vitest';
import { db, schema } from '$lib/server/db';
import { createNote } from '$lib/server/notes';
import { NOTE_FILTER_MAX_TAGS } from '$lib/notes';
import { load } from './+page.server';

// #342: the notes list filters by several tags. The page never errors on a
// bad filter: extra tags are dropped and an unknown match reads as 'any'.
describe('notes list load', () => {
	const companionId = 'nps-c';
	const userId = 'nps-u';

	beforeAll(async () => {
		await db.insert(schema.users).values({
			id: userId,
			username: userId,
			displayName: 'Member',
			role: 'member'
		} as typeof schema.users.$inferInsert);
		await db.insert(schema.companions).values({ id: companionId, name: 'Rex' });
		const n = (title: string, tags: string[]) =>
			createNote(
				companionId,
				{ title, body: '', tags, pinned: false, sharedWithCaretakers: false },
				userId
			);
		await n('food', ['food']);
		await n('both', ['food', 'hand signals']);
		await n('signals', ['hand signals']);
	});

	async function run(query: string) {
		const data = (await load({
			params: { companionId },
			locals: { user: { id: userId, role: 'member' }, locale: 'en' },
			parent: async () => ({ companion: { id: companionId } }),
			url: new URL(`http://x/${companionId}/notes${query}`)
		} as unknown as Parameters<typeof load>[0])) as {
			notes: { title: string }[];
			selectedTags: string[];
			match: string;
			filtered: boolean;
			manyRequested: boolean;
		};
		return { ...data, titles: data.notes.map((n) => n.title).sort() };
	}

	it('lists everything without a filter', async () => {
		const d = await run('');
		expect(d).toMatchObject({ selectedTags: [], match: 'any', filtered: false });
		expect(d.titles).toEqual(['both', 'food', 'signals']);
	});

	it('matches any by default and all on request, with +-encoded spaces', async () => {
		expect((await run('?tag=food&tag=hand+signals')).titles).toEqual(['both', 'food', 'signals']);
		const all = await run('?tag=food&tag=hand+signals&match=all');
		expect(all.titles).toEqual(['both']);
		expect(all).toMatchObject({
			selectedTags: ['food', 'hand signals'],
			match: 'all',
			filtered: true,
			manyRequested: true
		});
	});

	it('keeps a single ?tag= link working', async () => {
		const d = await run('?tag=Food');
		expect(d.titles).toEqual(['both', 'food']);
		expect(d).toMatchObject({ selectedTags: ['food'], manyRequested: false });
	});

	it('treats a lone invalid tag as filtered with nothing selected', async () => {
		const d = await run(`?tag=${'x'.repeat(33)}`);
		expect(d).toMatchObject({ titles: [], selectedTags: [], filtered: true, manyRequested: false });
	});

	it('drops an invalid tag under any, empties under all', async () => {
		const bad = 'x'.repeat(33);
		expect((await run(`?tag=food&tag=${bad}`)).titles).toEqual(['both', 'food']);
		expect((await run(`?tag=food&tag=${bad}&match=all`)).titles).toEqual([]);
	});

	it('falls back to any for an unknown match', async () => {
		const d = await run('?tag=food&tag=hand+signals&match=ALL');
		expect(d.match).toBe('any');
		expect(d.titles).toEqual(['both', 'food', 'signals']);
	});

	it('keeps only the first tags over the cap', async () => {
		const extra = Array.from({ length: NOTE_FILTER_MAX_TAGS }, (_, i) => `&tag=t${i}`).join('');
		const d = await run(`?tag=food${extra}`);
		expect(d.selectedTags).toHaveLength(NOTE_FILTER_MAX_TAGS);
		expect(d.selectedTags[0]).toBe('food');
	});
});
