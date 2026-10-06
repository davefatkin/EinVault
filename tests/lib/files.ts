// Tiny valid files for upload tests. Kept as buffers so specs can use
// page.setInputFiles(selector, { name, mimeType, buffer }) without disk I/O.

/** 1x1 transparent PNG. */
export const PNG_BYTES = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64'
);

/** Minimal single-page PDF. */
export const PDF_BYTES = Buffer.from(
	`%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >> endobj
xref
0 4
0000000000 65535 f
trailer << /Size 4 /Root 1 0 R >>
startxref
0
%%EOF
`
);

export function pngUpload(name = 'photo.png') {
	return { name, mimeType: 'image/png', buffer: PNG_BYTES };
}

export function pdfUpload(name = 'doc.pdf') {
	return { name, mimeType: 'application/pdf', buffer: PDF_BYTES };
}

/**
 * Bytes that pass the server's MP4 signature check (`ftyp` at bytes 4..8) but
 * are not a decodable video. Enough to exercise the store-as-is upload path;
 * the browser can't play it, so assert the media URL, not playback.
 */
export const MP4_SIGNATURE_BYTES = Buffer.from([
	0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00
]);

export function mp4Upload(name = 'clip.mp4') {
	return { name, mimeType: 'video/mp4', buffer: MP4_SIGNATURE_BYTES };
}
