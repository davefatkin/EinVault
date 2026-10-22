import { apiRoute, apiRouteZod } from '#lib/server/auth/api-request.js';
import { withIdempotency } from '#lib/server/api-idempotency.js';
import { throwCareError } from '#lib/server/care-errors.js';
import { authorizeCompanions } from '#lib/server/companion-scope.js';
import { requireAllowedCompanion } from '#lib/server/api-guards.js';
import { paginate } from '#lib/server/pagination.js';
import { createNote, listNotes } from '#lib/server/notes.js';
import { toApiNote } from '#lib/server/api-serializers.js';
import { NoteCreate } from '#lib/server/openapi/schemas.js';
import { tagFilterMatchesNothing, validateNewNote } from '#lib/notes.js';
import {
	noteCodeFor,
	parsePinnedParam,
	parseTagFilterParams,
	requireNoteOwnerScope,
	throwNoteError
} from '#lib/server/notes-api.js';

// GET /api/notes?companionId=&tag=&match=&pinned=&limit=&offset=. Full scope,
// owners only. Repeat tag for several; match=all requires every one.
export const GET = apiRoute(async ({ event, user, scope, locale }) => {
	requireNoteOwnerScope(scope, user, locale);
	const companionId = await requireAllowedCompanion(event.url, user, locale);
	const pinned = parsePinnedParam(event.url.searchParams.get('pinned'), locale);
	const filter = parseTagFilterParams(event.url.searchParams, locale);
	// A filter that can't match still has its limit/offset checked.
	const { page, hasMore } = await paginate(event.url, locale, (take, offset) =>
		tagFilterMatchesNothing(filter)
			? Promise.resolve([])
			: listNotes(companionId, {
					tags: filter.tags,
					match: filter.match,
					pinned,
					limit: take,
					offset
				})
	);
	return Response.json({ notes: page.map(toApiNote), hasMore });
});

// POST /api/notes: create one note. Idempotent with an Idempotency-Key header.
export const POST = apiRouteZod(
	NoteCreate,
	async ({ event, user, scope, tokenId, locale, body }) => {
		requireNoteOwnerScope(scope, user, locale);
		const checked = validateNewNote(body);
		if (!checked.ok) throwNoteError(checked.code, locale);
		return withIdempotency(
			{ request: event.request, tokenId, endpoint: 'notes', body },
			async () => {
				const resolved = await authorizeCompanions({ id: user.id, role: user.role }, [
					body.companionId
				]);
				if (!resolved.ok) throwCareError(resolved.code, locale);
				const id = await createNote(body.companionId, checked.value, user.id);
				return { status: 201, data: { id, companionId: body.companionId } };
			}
		);
	},
	noteCodeFor
);
