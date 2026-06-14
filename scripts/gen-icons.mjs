// Generates the brand favicon + PWA icons from the shared PawLogo path.
// Source of truth: the paw `d` in src/lib/components/PawLogo.svelte and the
// brand gradient (violet -> coral, matching --brand-gradient in app.css).
// Run with: node scripts/gen-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const STATIC = path.join(ROOT, 'static');

const pawComponent = fs.readFileSync(path.join(ROOT, 'src/lib/components/PawLogo.svelte'), 'utf8');
const d = pawComponent.match(/\sd="([^"]+)"/)?.[1];
if (!d) throw new Error('Could not extract paw path from PawLogo.svelte');

// Brand gradient stops (hsl(255 89% 62%) -> hsl(12 86% 59%)) as hex.
const GRAD_A = '#7348f4';
const GRAD_B = '#f0603d';
const PAW_VIEWBOX = '0 0 419.14 403.6';

/** Build a square brand icon SVG at `size` px with the paw inset by `inset` px. */
function iconSvg(size, inset) {
	const inner = size - inset * 2;
	const rx = Math.round((size * 7) / 32);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="${size}" y2="${size}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${GRAD_A}"/>
      <stop offset="1" stop-color="${GRAD_B}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${rx}" fill="url(#g)"/>
  <svg x="${inset}" y="${inset}" width="${inner}" height="${inner}" viewBox="${PAW_VIEWBOX}">
    <path fill="#fff" d="${d}"/>
  </svg>
</svg>`;
}

// Crisp scalable favicon (~12.5% inset).
fs.writeFileSync(path.join(STATIC, 'favicon.svg'), `${iconSvg(32, 4)}\n`);

// Rasterized icons. ~12.5% inset for standard, ~20% safe zone for maskable.
const targets = [
	['apple-touch-icon.png', 180, 22],
	['icon-192.png', 192, 24],
	['icon-512.png', 512, 64],
	['icon-512-maskable.png', 512, 102]
];
for (const [name, size, inset] of targets) {
	await sharp(Buffer.from(iconSvg(size, inset)))
		.png()
		.toFile(path.join(STATIC, name));
	console.log(`wrote static/${name}`);
}
console.log('wrote static/favicon.svg');
