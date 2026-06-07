import { NTFY_CONFIG } from '$lib/server/env';

// ntfy publisher (issue #12). Uses the JSON publish endpoint (POST to the
// server base with the topic in the body) instead of topic-URL PUT with
// Title headers: JSON bodies carry UTF-8 titles (umlauts, accents) safely,
// raw HTTP headers do not.

export function isNtfyEnabled(): boolean {
	return NTFY_CONFIG !== null;
}

// ntfy topic rules: letters, digits, underscore, dash. Enforced both at
// settings-save time and (defensively) before publish.
export const NTFY_TOPIC_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface NtfyMessage {
	title: string;
	message: string;
	// Optional click-through URL (ntfy 'click' action).
	click?: string | null;
}

export async function sendNtfy(topic: string, msg: NtfyMessage): Promise<void> {
	if (!NTFY_CONFIG) throw new Error('ntfy is not configured');
	if (!NTFY_TOPIC_RE.test(topic)) throw new Error(`invalid ntfy topic '${topic}'`);
	const res = await fetch(NTFY_CONFIG.baseUrl, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			...(NTFY_CONFIG.token ? { authorization: `Bearer ${NTFY_CONFIG.token}` } : {})
		},
		body: JSON.stringify({
			topic,
			title: msg.title,
			message: msg.message,
			...(msg.click ? { click: msg.click } : {})
		})
	});
	if (!res.ok) {
		throw new Error(`ntfy publish failed: ${res.status} ${res.statusText}`);
	}
}
