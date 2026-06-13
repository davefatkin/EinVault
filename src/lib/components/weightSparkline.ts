/**
 * Builds an SVG path `d` string from an array of numeric values,
 * scaled to fit within the given width × height bounding box.
 *
 * Returns an empty string for fewer than 2 points (nothing to draw).
 */
export function buildSparklinePath(values: number[], width: number, height: number): string {
	if (values.length < 2) return '';

	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = max - min || 1; // avoid division by zero when all values identical

	const pad = 2; // vertical padding so the stroke isn't clipped at edges

	const points = values.map((v, i) => {
		const x = (i / (values.length - 1)) * width;
		const y = pad + (1 - (v - min) / range) * (height - pad * 2);
		return `${x.toFixed(2)},${y.toFixed(2)}`;
	});

	return 'M' + points.join('L');
}
