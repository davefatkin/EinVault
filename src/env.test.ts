import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { variables } from './env';

const SRC = __dirname;
const ROOT = join(SRC, '..');

// Names in .env.example that the app never reads through
// $env/dynamic/private: they configure the docker-compose files and the
// container user, not the server.
const NOT_READ_BY_APP = new Set([
	'EINVAULT_DATA',
	'EINVAULT_HOST',
	'EINVAULT_PORT',
	'PUID',
	'PGID'
]);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(ts|js|svelte)$/.test(name) && !name.endsWith('.test.ts')) out.push(full);
	}
	return out;
}

function usedNames(): Set<string> {
	const names = new Set<string>();
	for (const file of walk(SRC)) {
		const text = readFileSync(file, 'utf8');
		if (!text.includes('$env/dynamic/private')) continue;
		for (const m of text.matchAll(/\benv\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
	}
	// Names read by index (env[name]) from arrays in src/lib/server/env.ts
	// and src/lib/server/auth/oidc.ts.
	for (const file of ['lib/server/env.ts', 'lib/server/auth/oidc.ts']) {
		const text = readFileSync(join(SRC, file), 'utf8');
		for (const m of text.matchAll(/\[([^\]]*)\]/g)) {
			for (const s of m[1].matchAll(/'([A-Z][A-Z0-9_]+)'/g)) names.add(s[1]);
		}
	}
	return names;
}

function exampleNames(): Set<string> {
	const text = readFileSync(join(ROOT, '.env.example'), 'utf8');
	const names = new Set<string>();
	for (const m of text.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) names.add(m[1]);
	return names;
}

describe('src/env.ts', () => {
	it('declares every variable read through $env/dynamic/private', () => {
		const missing = [...usedNames()].filter((n) => !(n in variables)).sort();
		expect(missing, `undeclared in src/env.ts: ${missing.join(', ')}`).toEqual([]);
	});

	it('declares every variable documented in .env.example that the app reads', () => {
		const missing = [...exampleNames()]
			.filter((n) => !NOT_READ_BY_APP.has(n) && !(n in variables))
			.sort();
		expect(missing, `undeclared in src/env.ts: ${missing.join(', ')}`).toEqual([]);
	});

	it('does not allowlist names the app actually reads', () => {
		const used = usedNames();
		expect([...NOT_READ_BY_APP].filter((n) => used.has(n))).toEqual([]);
	});

	it('passes values through unchanged and never requires one', () => {
		for (const [name, entry] of Object.entries(variables)) {
			const schema = (entry as { schema: unknown }).schema as {
				'~standard': { validate: (v: unknown) => unknown };
			};
			expect(schema['~standard'].validate(undefined), name).toEqual({ value: undefined });
			expect(schema['~standard'].validate('x'), name).toEqual({ value: 'x' });
		}
	});

	it('declares nothing as public or static', () => {
		for (const [name, entry] of Object.entries(variables)) {
			const cfg = entry as { public?: boolean; static?: boolean };
			expect(cfg.public ?? false, name).toBe(false);
			expect(cfg.static ?? false, name).toBe(false);
		}
	});
});
