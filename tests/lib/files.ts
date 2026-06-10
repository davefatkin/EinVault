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
