# Contributing to EinVault

EinVault is a small homelab project. The goal is to keep it simple, self-contained, and runnable on your own hardware with no external dependencies. Contributions are welcome, just keep that in mind.

## Reporting bugs

Open an issue. Include what you were doing, what you expected, what actually happened, and steps to reproduce. Attach relevant logs (`docker logs einvault` or dev server output). The more specific, the better.

## Feature requests

Before opening one, ask yourself: does this work without any external service? Can it run air-gapped? Does it fit a companion health/care tracker? Features that phone home, require third-party accounts, or pull in heavy new runtimes are unlikely to land.

## Development setup

See the [README](README.md) for prerequisites. Short version:

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

App runs at `http://localhost:5173`. First visit goes to `/setup`.

## Code style

- TypeScript strict mode, no implicit `any`
- Svelte 5 runes (`$state`, `$derived`, `$effect`), no legacy Svelte 4 syntax
- Prettier + ESLint: run `npm run format` before committing, `npm run lint` to check

## Pull requests

Keep PRs focused on one thing. Describe what it does and why. Before opening:

- `npm run check` must pass clean
- `npm run lint` no errors

If it's a bug fix, explain the root cause. If it's a feature, note how you tested it.

## Database schema changes

If you touch `src/lib/server/db/schema.ts`:

1. Run `npm run db:generate` to create the migration file
2. Run `npm run db:migrate` to apply it locally
3. Commit both the schema change and the migration together

Don't hand-edit migration files or squash them. Existing installs need the full history to upgrade.

## License

Contributions are licensed under [MIT](LICENSE).
