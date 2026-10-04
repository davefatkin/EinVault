// Search result types, shared by the server search module and the client
// palette so they can't drift: the palette builds its filter chips and result
// groups from this list, and a type missing there is silently dropped.
// Order is the palette's display order.
export const SEARCH_ENTITY_TYPES = [
	'journal',
	'daily',
	'health',
	'weight',
	'reminder',
	'document',
	'media',
	'note'
] as const;
export type SearchEntityType = (typeof SEARCH_ENTITY_TYPES)[number];
