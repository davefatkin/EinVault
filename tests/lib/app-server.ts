import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { getFreePort } from './ports';

export interface AppServer {
	baseURL: string;
	port: number;
	env: Record<string, string>;
	logs: string[];
	stop(): Promise<void>;
}

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

export async function startAppServer(opts: {
	dbPath: string;
	env?: Record<string, string>;
}): Promise<AppServer> {
	// Caller may pre-allocate the port (needed when other env vars must embed
	// it, e.g. OIDC_REDIRECT_URI); otherwise probe one now.
	const port = opts.env?.PORT ? Number(opts.env.PORT) : await getFreePort();
	if (Number.isNaN(port) || !Number.isInteger(port) || port <= 0) {
		throw new Error(`invalid PORT override: ${opts.env?.PORT}`);
	}
	const baseURL = `http://localhost:${port}`;

	const childEnv: Record<string, string> = {
		// Deliberately NOT inheriting process.env: a dev .env or shell var must
		// not leak real service URLs into tests. PATH is needed to find node.
		PATH: process.env.PATH ?? '',
		NODE_ENV: 'production',
		PORT: String(port),
		ORIGIN: baseURL, // without this, SvelteKit CSRF rejects every form POST
		BODY_SIZE_LIMIT: '512M', // adapter-node defaults to 512KB; upload tests need room
		DATABASE_URL: opts.dbPath, // absolute; dirname doubles as DATA_DIR
		TZ: 'UTC',
		...opts.env
	};

	const logs: string[] = [];
	const child: ChildProcess = spawn('node', ['build'], {
		cwd: REPO_ROOT, // migrate-on-boot checks cwd-relative ./drizzle
		env: childEnv,
		stdio: ['ignore', 'pipe', 'pipe']
	});
	child.stdout!.on('data', (d: Buffer) => logs.push(d.toString()));
	child.stderr!.on('data', (d: Buffer) => logs.push(d.toString()));
	// Spawn failures (missing build/, ENOENT on node) emit 'error' and never
	// fire 'exit'; surface the cause instead of an opaque readiness timeout.
	let spawnError: Error | null = null;
	child.on('error', (err) => {
		spawnError = err;
		logs.push(`[spawn error] ${err.message}\n`);
	});

	const deadline = Date.now() + 30_000;
	let ready = false;
	while (Date.now() < deadline) {
		if (child.exitCode !== null || spawnError) break;
		try {
			const res = await fetch(`${baseURL}/auth/login`);
			if (res.ok) {
				ready = true;
				break;
			}
		} catch {
			/* not up yet */
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	if (!ready) {
		child.kill('SIGKILL');
		throw new Error(`app server failed to start on ${baseURL}\n--- logs ---\n${logs.join('')}`);
	}

	return {
		baseURL,
		port,
		env: childEnv,
		logs,
		stop: () =>
			new Promise((resolve) => {
				if (child.exitCode !== null) return resolve();
				const killTimer = setTimeout(() => child.kill('SIGKILL'), 3_000);
				killTimer.unref();
				child.once('exit', () => {
					clearTimeout(killTimer);
					resolve();
				});
				child.kill('SIGTERM');
			})
	};
}
