export interface DateGroup<T> {
	/** YYYY-MM-DD, or null for assets without a capture date. */
	date: string | null;
	assets: T[];
}

/**
 * Splits an already date-sorted asset list into runs of the same capture
 * date. Undated assets go into one trailing group.
 */
export function groupAssetsByDate<T extends { takenDate: string | null }>(
	assets: T[]
): DateGroup<T>[] {
	const groups: DateGroup<T>[] = [];
	const undated: T[] = [];
	for (const asset of assets) {
		if (!asset.takenDate) {
			undated.push(asset);
			continue;
		}
		const last = groups.at(-1);
		if (last?.date === asset.takenDate) last.assets.push(asset);
		else groups.push({ date: asset.takenDate, assets: [asset] });
	}
	if (undated.length) groups.push({ date: null, assets: undated });
	return groups;
}
