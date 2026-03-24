import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import svelteParser from 'svelte-eslint-parser';

/** Svelte 5 rune globals — compiler-injected, not present in any globals package */
const svelte5Runes = {
	$state: 'readonly',
	$derived: 'readonly',
	$effect: 'readonly',
	$props: 'readonly',
	$bindable: 'readonly',
	$inspect: 'readonly',
	$host: 'readonly'
};

export default [
	js.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	// TypeScript source files
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsParser
		}
	},
	// Svelte files: wire the TypeScript parser into svelte-eslint-parser for script blocks
	{
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: tsParser
			},
			globals: {
				...svelte5Runes
			}
		},
		rules: {
			// The custom_element_props_identifier diagnostic is only meaningful for components
			// compiled with `customElement: true`. Standard Svelte components using rest props
			// with $props() (e.g. bits-ui / shadcn-svelte wrappers) are valid Svelte 5 syntax.
			'svelte/valid-compile': ['error', { ignoreWarnings: true }],
			// {@html} is used intentionally throughout this project to render sanitised markdown
			// output from the `marked` library. Disable the blanket XSS warning.
			'svelte/no-at-html-tags': 'off',
			// This rule is documented to flag navigation inside beforeNavigate's resolve()
			// callback, but in v3 it incorrectly fires on ordinary <a href> links and goto()
			// calls throughout the app. Disable until upstream fixes the false positives.
			'svelte/no-navigation-without-resolve': 'off'
		}
	},
	// Configure no-unused-vars globally: args: 'none' prevents false positives on named
	// parameters in TypeScript interface/type function signatures (e.g. oninput?: (e: Event) => void).
	// Those names are documentation, not runtime bindings.
	{
		rules: {
			'no-unused-vars': ['error', { vars: 'all', args: 'none' }]
		}
	},
	// SvelteKit ambient type declaration files use interface/type inside declare global.
	// ESLint's no-unused-vars fires on them because the types are never "used" at runtime.
	// This must come after the global no-unused-vars override so the file-scoped rule wins.
	{
		files: ['**/*.d.ts'],
		rules: {
			'no-unused-vars': 'off'
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/']
	}
];
