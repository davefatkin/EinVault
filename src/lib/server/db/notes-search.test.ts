import { describe, it, expect, beforeAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

function noteHits(term: string): string[] {
	return (
		db.$client
			.prepare(
				"SELECT entity_id FROM search_index WHERE search_index MATCH ? AND entity_type = 'note'"
			)
			.all(`"${term}"`) as { entity_id: string }[]
	).map((r) => r.entity_id);
}

function rowCount(id: string): number {
	return (
		db.$client
			.prepare(
				"SELECT count(*) AS n FROM search_index WHERE entity_type = 'note' AND entity_id = ?"
			)
			.get(id) as { n: number }
	).n;
}

describe('note search triggers', () => {
	beforeAll(async () => {
		await db.insert(schema.companions).values({ id: 'c-ns', name: 'Rex' });
	});

	it('indexes an untagged note by title and body', async () => {
		await db
			.insert(schema.notes)
			.values({ id: 'n-plain', companionId: 'c-ns', title: 'Feeding', body: 'kibble twice' });
		expect(noteHits('kibble')).toContain('n-plain');
		expect(noteHits('Feeding')).toContain('n-plain');
	});

	it('indexes tags and keeps exactly one row per note', async () => {
		await db
			.insert(schema.notes)
			.values({ id: 'n-tags', companionId: 'c-ns', title: 'Tricks', body: 'spin' });
		await db.insert(schema.noteTags).values([
			{ noteId: 'n-tags', tag: 'training' },
			{ noteId: 'n-tags', tag: 'agility' }
		]);
		expect(noteHits('agility')).toContain('n-tags');
		expect(rowCount('n-tags')).toBe(1);
	});

	it('stops matching a removed tag', async () => {
		await db
			.delete(schema.noteTags)
			.where(and(eq(schema.noteTags.noteId, 'n-tags'), eq(schema.noteTags.tag, 'agility')));
		expect(noteHits('agility')).not.toContain('n-tags');
		expect(noteHits('training')).toContain('n-tags');
		expect(rowCount('n-tags')).toBe(1);
	});

	it('reindexes on note update', async () => {
		await db.update(schema.notes).set({ body: 'roll over' }).where(eq(schema.notes.id, 'n-tags'));
		expect(noteHits('roll')).toContain('n-tags');
		expect(noteHits('training')).toContain('n-tags');
		expect(rowCount('n-tags')).toBe(1);
	});

	it('removes the row when the note is deleted, tags included', async () => {
		await db.delete(schema.notes).where(eq(schema.notes.id, 'n-tags'));
		expect(rowCount('n-tags')).toBe(0);
		expect(noteHits('training')).not.toContain('n-tags');
	});
});
