import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig(({ command }) => {
	// Vite HMR injects inline scripts into the dev server response that bypass
	// SvelteKit's nonce machinery, so dev needs `'unsafe-inline'` to function.
	// CSP Level 3 (all modern browsers) ignores `'unsafe-inline'` when a nonce is
	// also present, so production gets a strict nonce-only policy.
	const dev = process.env.NODE_ENV !== 'production';

	// `svelte-kit sync` resolves this config with command 'build' too, but it
	// emits no bundle, so it must not trip the guard.
	const isSync = process.argv.slice(2).includes('sync');

	if (command === 'build' && dev && !isSync) {
		throw new Error(
			`vite.config.ts: NODE_ENV must be "production" during build, got: ${JSON.stringify(process.env.NODE_ENV)}`
		);
	}

	return {
		plugins: [
			tailwindcss(),
			sveltekit({
				adapter: adapter({
					out: 'build'
				}),
				preprocess: vitePreprocess(),
				csp: {
					mode: 'nonce',
					directives: {
						'default-src': ['self'],
						'script-src': dev ? ['self', 'unsafe-inline'] : ['self'],
						'style-src': ['self', 'unsafe-inline'],
						'font-src': ['self'],
						'img-src': ['self', 'data:', 'blob:'],
						'media-src': ['self', 'blob:'],
						'connect-src': ['self'],
						'frame-ancestors': ['none'],
						'base-uri': ['self'],
						'form-action': ['self']
					}
				}
			})
		],
		server: {
			host: '127.0.0.1',
			port: 5173
		},
		test: {
			include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
			environment: 'node',
			setupFiles: ['./src/vitest.setup.ts']
		}
	};
});
