// Kit 3 still serves $env/dynamic/private at runtime (it re-exports
// $app/env/private) but no longer ships a type declaration for it. Keep the
// Kit 2 shape until the imports move to $app/env/private. Only variables
// declared in src/env.ts have values.
declare module '$env/dynamic/private' {
	export const env: Record<string, string | undefined>;
}
