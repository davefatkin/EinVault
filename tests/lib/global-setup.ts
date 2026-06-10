import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export default function globalSetup() {
	const buildEntry = path.join(REPO_ROOT, 'build', 'index.js');
	if (process.env.PW_SKIP_BUILD === '1') {
		if (!fs.existsSync(buildEntry)) {
			throw new Error('PW_SKIP_BUILD=1 but build/ is missing');
		}
		return;
	}
	if (!fs.existsSync(buildEntry)) {
		console.log('[e2e] no build found, running npm run build…');
		execSync('npm run build', { cwd: REPO_ROOT, stdio: 'inherit' });
	} else {
		console.log('[e2e] reusing existing build/ (delete build/ to force rebuild)');
	}
}
