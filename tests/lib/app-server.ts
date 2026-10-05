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

class PortInUseError extends Error {}

// A probed port can be taken before the child binds it (see ports.ts), so an
// auto-picked port gets a few tries.
const MAX_PORT_ATTEMPTS = 3;

export async function startAppServer(opts: {
	dbPath: string;
	env?: Record<string, string>;
}): Promise<AppServer> {
	// Caller may pre-allocate the port (needed when other env vars must embed
	// it, e.g. OIDC_REDIRECT_URI); a collision on that port can't be retried here.
	const fixedPort = Boolean(opts.env?.PORT);
	for (let attempt = 1; ; attempt++) {
		const port = fixedPort ? Number(opts.env!.PORT) : await getFreePort();
		if (Number.isNaN(port) || !Number.isInteger(port) || port <= 0) {
			throw new Error(`invalid PORT override: ${opts.env?.PORT}`);
		}
		try {
			return await launch(port, opts);
		} catch (err) {
			if (fixedPort || attempt >= MAX_PORT_ATTEMPTS || !(err instanceof PortInUseError)) throw err;
		}
	}
}

async function launch(
	port: number,
	opts: { dbPath: string; env?: Record<string, string> }
): Promise<AppServer> {
	const baseURL = `http://localhost:${port}`;

	const childEnv: Record<string, string> = {
		// Deliberately NOT inheriting process.env: a dev .env or shell var must
		// not leak real service URLs into tests. PATH is needed to find node.
		PATH: process.env.PATH ?? '',
		NODE_ENV: 'production',
		ORIGIN: baseURL, // without this, SvelteKit CSRF rejects every form POST
		BODY_SIZE_LIMIT: '512M', // adapter-node defaults to 512KB; upload tests need room
		DATABASE_URL: opts.dbPath, // absolute; dirname doubles as DATA_DIR
		TZ: 'UTC',
		...opts.env,
		PORT: String(port)
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

	// Ready means this child logged that it is listening AND answers. The fetch
	// alone could be answered by whatever else holds the port.
	const deadline = Date.now() + 30_000;
	let ready = false;
	while (Date.now() < deadline) {
		if (child.exitCode !== null || spawnError) break;
		if (/Listening on/.test(logs.join(''))) {
			try {
				const res = await fetch(`${baseURL}/auth/login`);
				if (res.ok) {
					ready = true;
					break;
				}
			} catch {
				/* not up yet */
			}
		}
		await new Promise((r) => setTimeout(r, 150));
	}
	if (!ready) {
		// 'exit' can fire before the pipes drain, so give the child a moment to
		// close and flush the EADDRINUSE trace before reading the logs.
		const closed = new Promise((r) => child.once('close', r));
		child.kill('SIGKILL');
		await Promise.race([closed, new Promise((r) => setTimeout(r, 1_000))]);
		const output = logs.join('');
		const message = `app server failed to start on ${baseURL}\n--- logs ---\n${output}`;
		throw output.includes('EADDRINUSE') ? new PortInUseError(message) : new Error(message);
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
