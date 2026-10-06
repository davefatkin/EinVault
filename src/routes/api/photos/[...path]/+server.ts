import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { t } from '$lib/i18n';
import { resolveJournalMedia, type ResolvedMedia } from '$lib/server/media-access';
import { serveStoredMedia } from '$lib/server/media-serve';

// URL shapes:
//   /api/photos/journal/{companionId}/{date}/{filename}
// `?poster` serves a transcoded video's poster instead of the video.
export const GET: RequestHandler = async ({ params, url, locals, request }) => {
	if (!locals.user) error(401, t(locals.locale, 'error.unauthorized'));

	const segments = (params.path ?? '').split('/');
	const wantPoster = url.searchParams.has('poster');

	let resolved: ResolvedMedia;
	switch (segments[0]) {
		case 'journal':
			resolved = await resolveJournalMedia(segments, locals.user, locals.locale, wantPoster);
			break;
		default:
			error(404, t(locals.locale, 'error.notFound'));
	}

	return serveStoredMedia(resolved, request, locals.locale);
};
