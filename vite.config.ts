import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		host: '127.0.0.1',
		port: 5173
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
		setupFiles: ['./src/vitest.setup.ts']
	}
});
