import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Vite HMR injects inline scripts into the dev server response that bypass
// SvelteKit's nonce machinery, so dev needs `'unsafe-inline'` to function.
// CSP Level 3 (all modern browsers) ignores `'unsafe-inline'` when a nonce is
// also present, so production gets a strict nonce-only policy.
const dev = process.env.NODE_ENV !== 'production';

if (process.env.npm_lifecycle_event === 'build' && dev) {
	throw new Error(
		`svelte.config.js: NODE_ENV must be "production" during build, got: ${JSON.stringify(process.env.NODE_ENV)}`
	);
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter({
			out: 'build'
		}),
		csp: {
			mode: 'nonce',
			directives: {
				'default-src': ['self'],
				'script-src': dev ? ['self', 'unsafe-inline'] : ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'font-src': ['self'],
				'img-src': ['self', 'data:', 'blob:'],
				'connect-src': ['self'],
				'frame-ancestors': ['none'],
				'base-uri': ['self'],
				'form-action': ['self']
			}
		},
		alias: {
			$lib: './src/lib',
			$components: './src/lib/components',
			$server: './src/lib/server'
		}
	}
};

export default config;
