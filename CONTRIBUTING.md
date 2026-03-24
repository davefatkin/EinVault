# Contributing to EinVault

EinVault is a small, focused, self-hosted project built for homelab use. The goal is to keep it simple, self-contained, and runnable entirely on your own hardware with no external dependencies. Contributions are welcome — just keep that philosophy in mind.

## Ways to contribute

- **Bug reports** — if something is broken, file an issue
- **Feature requests** — ideas that fit the homelab/self-hosted use case
- **Documentation** — corrections, clarifications, better examples
- **Code** — bug fixes, improvements, new features via pull request

## Reporting bugs

Open an issue and include:

1. What you were trying to do
2. What you expected to happen
3. What actually happened
4. Steps to reproduce (minimal and specific)
5. Your environment: OS, Docker version or Node.js version, browser if relevant
6. Relevant logs — check `docker logs einvault` or the dev server output

The more specific you are, the faster it gets fixed.

## Feature requests

Feature requests are welcome. Before opening one, consider whether the feature:

- Works without any external service (no cloud APIs, no SaaS dependencies)
- Can run air-gapped on a home server
- Fits the scope of a dog care and health tracker
- Keeps the Docker image and runtime lean

Features that require phoning home, registering with a third-party service, or pulling in heavy new runtimes are unlikely to be accepted.

## Development setup

See the [README](README.md) for full prerequisites and setup instructions. The short version:

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

App runs at `http://localhost:5173`. First visit goes to `/setup` to create the admin account.

## Code style

- **TypeScript strict mode** — no implicit `any`, types must be explicit
- **Svelte 5 runes** — use `$state`, `$derived`, `$effect`; do not use legacy Svelte 4 reactive syntax
- **Prettier + ESLint** — enforced; run `npm run format` before committing, `npm run lint` to check
- **No unused imports or variables** — ESLint will catch these
- Keep components focused and small; prefer composition over large monolithic components

## Submitting a pull request

- Keep PRs small and focused on one thing — a bug fix, a single feature, a documentation update
- Describe what the PR does and why in the PR description
- Before opening the PR, confirm the following pass locally:
  - `npm run check` — type checking must pass with no errors
  - `npm run lint` — no lint or formatting errors
- If you are fixing a bug, explain the root cause in the PR description
- If you are adding a feature, note how you tested it

PRs that fail `check` or `lint` will not be merged until those are resolved.

## Database schema changes

If your change modifies the database schema (`src/lib/server/db/schema.ts`):

1. Run `npm run db:generate` to create a new Drizzle migration file
2. Run `npm run db:migrate` to apply it locally and verify it works
3. Include both the schema change and the generated migration file in your PR

Do not hand-edit migration files. Do not squash or delete migration files — the migration history must remain intact so existing installations can upgrade cleanly.

## Self-hosted principles

All contributions must respect the following:

- **No telemetry** — no analytics, no error reporting to external services, no usage pings
- **No cloud dependencies** — the app must work with no internet access after the Docker image is pulled
- **Air-gap compatible** — assumes only a local network; no OAuth flows against external providers, no CDN-loaded assets
- **Lean image** — avoid adding large new dependencies to the Docker image without strong justification

## Code of conduct

Be direct and respectful. This is a small open-source project maintained in spare time. Feedback should be constructive. Personal attacks, harassment, or bad-faith behavior will result in removal from the project. Standard open-source norms apply.

## License

By contributing to EinVault, you agree that your contributions will be licensed under the [MIT License](LICENSE).
