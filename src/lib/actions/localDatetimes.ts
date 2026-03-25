/**
 * Svelte action for <form> elements.
 *
 * datetime-local inputs send values like "2024-03-24T06:00" with no timezone
 * info. The browser treats these as local time, but Node.js on a UTC server
 * parses them as UTC. This causes timestamps to be stored offset by the user's
 * UTC offset.
 *
 * This action listens for the `formdata` event (fired when SvelteKit's enhance
 * calls `new FormData(form)`) and replaces each datetime-local value with a
 * proper UTC ISO string before the data reaches the server.
 *
 * Note: I missed this while testing on local hardware.
 */
export function localDatetimes(node: HTMLFormElement) {
	function onFormdata(e: FormDataEvent) {
		node.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]').forEach((el) => {
			if (!el.value || !el.name) return;
			const d = new Date(el.value);
			if (!isNaN(d.getTime())) {
				e.formData.set(el.name, d.toISOString());
			}
		});
	}

	node.addEventListener('formdata', onFormdata);
	return {
		destroy() {
			node.removeEventListener('formdata', onFormdata);
		}
	};
}
