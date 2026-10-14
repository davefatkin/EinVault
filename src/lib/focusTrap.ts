const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Keep Tab and Shift+Tab inside a dialog. Call from its keydown handler. */
export function trapTab(container: HTMLElement, e: KeyboardEvent): void {
	if (e.key !== 'Tab') return;
	const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		(el) => !el.hasAttribute('disabled')
	);
	if (!focusable.length) return;
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	// Focus on the container itself (e.g. after a click on its padding) counts
	// as the edge in both directions.
	const onContainer = document.activeElement === container;
	if (e.shiftKey && (onContainer || document.activeElement === first)) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && (onContainer || document.activeElement === last)) {
		e.preventDefault();
		first.focus();
	}
}
