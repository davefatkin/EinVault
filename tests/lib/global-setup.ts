import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export default function globalSetup() {
	const buildEntry = path.join(REPO_ROOT, 'build', 'index.js');
	// Written by adapter-node 6 only. A leftover adapter-node 5 build honors
	// ORIGIN by itself and would hide serve.js bugs.
	const adapterMarker = path.join(REPO_ROOT, 'build', 'adapter-node.js');
	const current = fs.existsSync(buildEntry) && fs.existsSync(adapterMarker);
	if (process.env.PW_SKIP_BUILD === '1') {
		if (!current) {
			throw new Error('PW_SKIP_BUILD=1 but build/ is missing or stale (rm -rf build)');
		}
		return;
	}
	if (!current) {
		console.log('[e2e] no current build found, running npm run build…');
		fs.rmSync(path.join(REPO_ROOT, 'build'), { recursive: true, force: true });
		execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
	} else {
		console.log('[e2e] reusing existing build/ (delete build/ to force rebuild)');
	}
}
