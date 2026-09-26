import { describe, it, expect } from 'vitest';
import { groupAssetsByDate } from './immichGroups';

const a = (id: string, takenDate: string | null) => ({ id, takenDate });

describe('groupAssetsByDate', () => {
	it('returns no groups for no assets', () => {
		expect(groupAssetsByDate([])).toEqual([]);
	});

	it('groups consecutive assets by date, preserving order', () => {
		const groups = groupAssetsByDate([
			a('1', '2026-09-26'),
			a('2', '2026-09-26'),
			a('3', '2026-09-25')
		]);
		expect(groups).toEqual([
			{ date: '2026-09-26', assets: [a('1', '2026-09-26'), a('2', '2026-09-26')] },
			{ date: '2026-09-25', assets: [a('3', '2026-09-25')] }
		]);
	});

	it('merges a date split across a page boundary into one group', () => {
		// Pages are appended to one list, so a day spanning pages is still contiguous.
		const page1 = [a('1', '2026-09-26'), a('2', '2026-09-25')];
		const page2 = [a('3', '2026-09-25'), a('4', '2026-09-24')];
		const groups = groupAssetsByDate([...page1, ...page2]);
		expect(groups.map((g) => [g.date, g.assets.map((x) => x.id)])).toEqual([
			['2026-09-26', ['1']],
			['2026-09-25', ['2', '3']],
			['2026-09-24', ['4']]
		]);
	});

	it('does not merge non-adjacent runs of the same date', () => {
		const groups = groupAssetsByDate([
			a('1', '2026-09-26'),
			a('2', '2026-09-25'),
			a('3', '2026-09-26')
		]);
		expect(groups.map((g) => g.date)).toEqual(['2026-09-26', '2026-09-25', '2026-09-26']);
	});

	it('collects undated assets into one trailing group', () => {
		const groups = groupAssetsByDate([a('1', null), a('2', '2026-09-26'), a('3', null)]);
		expect(groups.map((g) => [g.date, g.assets.map((x) => x.id)])).toEqual([
			['2026-09-26', ['2']],
			[null, ['1', '3']]
		]);
	});
});
