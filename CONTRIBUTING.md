# Contributing to EinVault

EinVault is a small homelab project. The goal is to keep it simple, self-contained, and runnable on your own hardware with no external dependencies. Contributions are welcome, just keep that in mind.

## Reporting bugs

Open an issue. Include what you were doing, what you expected, what actually happened, and steps to reproduce. Attach relevant logs (`docker logs einvault` or dev server output). The more specific, the better.

For suspected security vulnerabilities, do not open a public issue. See [SECURITY.md](SECURITY.md) for the private disclosure path.

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

## Testing

```bash
npm run test:unit   # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (Playwright, builds the app first)
npm test            # both
```

Unit tests live next to the code they cover (`src/**/*.test.ts`) and each test file gets a fresh in-memory database. E2e specs live in `tests/e2e/` and drive a real browser against real server processes booted from the production build; shared fixtures, seed data, and fakes (SMTP sink, mock OIDC IdP) live in `tests/lib/` and `tests/fakes/`.

The e2e suite needs Chromium once: `npx playwright install chromium`, plus `sudo npx playwright install-deps chromium` on Debian/Ubuntu for its system libraries. During iteration, `PW_SKIP_BUILD=1 npm run test:e2e` skips the rebuild and reuses the existing `build/` output; rebuild after changing server code.

## Pull requests

Keep PRs focused on one thing. Describe what it does and why. Before opening:

- `npm run check` must pass clean
- `npm run lint` no errors
- `npm test` green (CI runs the full suite on every PR)

If it's a bug fix, explain the root cause and add a test that would have caught it. If it's a feature, cover it with tests.

## Database schema changes

If you touch `src/lib/server/db/schema.ts`:

1. Run `npm run db:generate` to create the migration file
2. Run `npm run db:migrate` to apply it locally
3. Commit both the schema change and the migration together
4. If the change touches tables the test harness seeds, update `tests/lib/seed.ts` to match

Don't hand-edit migration files or squash them. Existing installs need the full history to upgrade.

## License

Contributions are licensed under [MIT](LICENSE).
