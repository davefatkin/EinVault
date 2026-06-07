# 🐾 EinVault

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

EinVault is a private, self-hosted companion health and care tracker built for homelabs. Track health records, daily activities, and care schedules for your animal companions. All data stays on your hardware. No cloud, no telemetry, no external accounts.

## Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Production (Docker)](#production-docker)
  - [Other options](#other-options)
  - [Video transcoding (optional)](#video-transcoding-optional)
  - [External image storage (optional)](#external-image-storage-optional)
  - [Immich integration (optional)](#immich-integration-optional)
  - [Data and backup](#data-and-backup)
  - [Container hardening](#container-hardening)
  - [Image tags](#image-tags)
  - [Verifying releases](#verifying-releases)
- [Docker (local build)](#docker-local-build)
- [Local development](#local-development)
  - [Commands](#commands)
- [User management](#user-management)
- [OIDC / SSO (optional)](#oidc--sso-optional)
  - [Required variables](#required-variables)
  - [Optional variables](#optional-variables)
  - [Account linking](#account-linking)
  - [Admin role mapping](#admin-role-mapping)
  - [Logout](#logout)
  - [Provider notes](#provider-notes)
- [Adding a new locale](#adding-a-new-locale)
- [Stack](#stack)
- [License](#license)

## Features

- **Companion profiles:** breed, bio, vet info, emergency contacts, and avatar photo
- **Daily journal:** per-companion entries with mood tracking, photo and video uploads, and a configurable daily media limit (default 5)
- **Health tracking:** vet visits, vaccinations, medications, procedures, and weight history
- **Activity logging:** walks, meals, bathroom trips, treats, play sessions, and grooming
- **Reminders:** recurring and one-time reminders for medications, vaccinations, grooming, and more
- **Caretaker shifts:** schedule work shifts and export to calendar via iCalendar (.ics)
- **Role-based access:** admins manage the app, members track health, caretakers log activities
- **Self-contained:** single Docker container, SQLite database, no external dependencies
- **Localization:** English, German, Spanish, French, Italian, and Portuguese (non-English translations are AI-generated and may contain errors)
- **Responsive UI:** works on desktop and mobile, with dark and light mode support

## Screenshots

### Caretaker Dashboard

![Caretaker dashboard](docs/screenshots/caretaker_dashboard.gif)

### Member Dashboard

![Member dashboard](docs/screenshots/member_dashboard_hybrid.png)

| Member Dashboard (mobile)                                                       | Caretaker Dashboard (mobile)                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| ![Member dashboard mobile](docs/screenshots/member_dashboard_mobile_readme.png) | ![Caretaker dashboard mobile](docs/screenshots/caretaker_mobile_dashboard_readme.png) |

[More screenshots](docs/SCREENSHOTS.md)

---

## Production (Docker)

Requires Docker Engine 24+, Docker Compose v2, and a reverse proxy for TLS (Caddy, Nginx, Traefik, or similar).

Download [`docker-compose.prod.yml`](docker-compose.prod.yml) and set your domain before starting:

**`ORIGIN`** — your public domain:

```yaml
ORIGIN: https://einvault.yourdomain.com
```

Then:

```bash
mkdir -p ./data
docker compose -f docker-compose.prod.yml up -d
```

Open your domain and follow the `/setup` prompt to create your admin account.

### Other options

Everything else in the compose file can be edited directly:

|                         | Default             | Description                                                                                                                                                |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TZ`                    | `UTC`               | Container timezone. Set to your local timezone (e.g. `America/New_York`, `Europe/London`) so dates and times display correctly.                            |
| `UPLOAD_MAX_MB`         | `10`                | Maximum size in MB for image (photo and avatar) uploads. `BODY_SIZE_LIMIT` is derived from the larger of this and `VIDEO_MAX_MB` at container start.       |
| `VIDEO_MAX_MB`          | `100`               | Maximum size in MB for journal video uploads. Videos are stored as-is unless transcoding is enabled (see below).                                           |
| `MAX_DAILY_MEDIA`       | `5`                 | Maximum number of journal photos and videos (combined) per companion per day. (Renamed from `MAX_DAILY_PHOTOS`, still honored with a deprecation warning.) |
| `REMINDER_UNDO_SECONDS` | `7`                 | Default undo window (seconds) when dismissing a Reminder. `0` disables the undo window. Each user can override in their settings.                          |
| `user`                  | `1000:1000`         | UID:GID the container runs as. Change if your `./data` directory has different ownership.                                                                  |
| `./data` volume         | `./data`            | Where the database and uploads are stored on the host.                                                                                                     |
| `DATABASE_URL`          | `/data/einvault.db` | Database path inside the container. Unlikely to need changing.                                                                                             |

### Video transcoding (optional)

By default, uploaded videos are stored exactly as received. A browser can only play codecs it supports, so a clip in a format like H.265/HEVC (common from Apple devices) may fail to play and fall back to a download link.

Set `VIDEO_TRANSCODE=true` to convert each uploaded video to a universal web profile (H.264 + AAC in an MP4 with the moov atom at the front) and generate a poster thumbnail. Conversion runs in the background after upload: the video shows a "converting" state and switches to the playable version when it finishes. The feature is off by default because it is CPU-intensive and depends on `ffmpeg`.

`ffmpeg` and `ffprobe` ship in the official Docker image, including the HEVC decoder needed to read Apple-recorded source and `libx264` for H.264 output. If you run outside the image and the binaries are not found, the feature disables itself and videos are stored as-is.

|                               | Default                | Description                                                                                                                                               |
| ----------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_TRANSCODE`             | `false`                | Enable background transcoding of uploaded videos to a web-playable MP4 plus a poster.                                                                     |
| `VIDEO_KEEP_ORIGINAL`         | `true`                 | Keep the original source file alongside the transcoded copy. The original is never served; it is retained for re-encoding or backup. `false` discards it. |
| `VIDEO_TRANSCODE_MAX_MB`      | `VIDEO_MAX_MB`         | Skip transcoding (store as-is) for inputs larger than this.                                                                                               |
| `VIDEO_TRANSCODE_MAX_SECONDS` | `600`                  | Skip transcoding for inputs longer than this.                                                                                                             |
| `VIDEO_TRANSCODE_MAX_WIDTH`   | `4096`                 | Skip transcoding for inputs wider than this.                                                                                                              |
| `VIDEO_TRANSCODE_MAX_HEIGHT`  | `4096`                 | Skip transcoding for inputs taller than this.                                                                                                             |
| `VIDEO_FFMPEG_PATH`           | `/usr/bin/ffmpeg`      | Absolute path to the `ffmpeg` binary. Override if it lives elsewhere (e.g. `/opt/homebrew/bin/ffmpeg` on macOS).                                          |
| `VIDEO_FFPROBE_PATH`          | `/usr/bin/ffprobe`     | Absolute path to the `ffprobe` binary.                                                                                                                    |
| `VIDEO_TMP_DIR`               | `<data>/transcode-tmp` | Scratch directory for in-progress transcodes. Must be on disk with room for the source plus output. Do not point it at the in-memory `/tmp` tmpfs.        |

Transcoding decodes attacker-supplied media with `ffmpeg`. The shipped compose files already run the container with a read-only root filesystem, all capabilities dropped, and `no-new-privileges`, which contains a decoder exploit. For extra isolation you can run the container without network access.

Transcoding is the only CPU-heavy thing EinVault does. It runs one job at a time with `ffmpeg` capped at two threads, so it never grabs the whole host, but the default `cpus: 0.5` / `memory: 256M` limits in `docker-compose.prod.yml` are sized for the app alone and are too low once it is enabled. With transcoding on, raise them to roughly `cpus: 1.5` (use `1.0` on a small host, `2.0` for the fastest conversions) and `memory: 512M` (`1G` if you allow large or 4K clips). The memory bump matters most: the worker buffers the whole clip while converting, and too low a limit will OOM-kill the job rather than slow it down.

### External image storage (optional)

By default, avatars and journal photos are written to `./data/uploads`. You can instead route new uploads to an S3-compatible bucket (AWS S3, Garage, MinIO, Backblaze B2, Cloudflare R2). Existing photos remain on disk; only new writes go to S3.

|                          | Default | Description                                                                                                                                                               |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STORAGE_BACKEND`        | `local` | `local` writes to `./data/uploads`. `s3` writes new uploads to the configured bucket. Reads always honor the per-row provider, so switching does not invalidate old rows. |
| `S3_ENDPOINT`            | —       | Full endpoint URL, e.g. `https://s3.garage.example.com` or `https://s3.us-east-1.amazonaws.com`.                                                                          |
| `S3_BUCKET`              | —       | Bucket name. Must already exist and should be private.                                                                                                                    |
| `S3_REGION`              | `auto`  | Region. For non-AWS providers, `auto` usually works.                                                                                                                      |
| `S3_ACCESS_KEY_ID`       | —       | Access key. Scope it to this bucket only.                                                                                                                                 |
| `S3_SECRET_ACCESS_KEY`   | —       | Secret key.                                                                                                                                                               |
| `S3_FORCE_PATH_STYLE`    | `false` | Set to `true` for Garage, MinIO, and older S3 deployments. Leave `false` for AWS and R2.                                                                                  |
| `S3_PRESIGN_TTL_SECONDS` | `300`   | Lifetime of presigned download URLs. Shorter is stricter, longer improves browser cache reuse on reload.                                                                  |

Downloads use short-lived presigned URLs (the app issues a 302 redirect). Access control is checked before the URL is issued; once issued, the URL stays valid for the full TTL even if permissions later change. Keep the TTL short.

### Immich integration (optional)

When `IMMICH_URL` and `IMMICH_API_KEY` are set, members and admins get a "Pick from Immich" option on the journal photo and companion avatar flows. The chosen asset stays in Immich; EinVault stores only a reference and proxies reads through the server using the API key. EinVault never uploads to Immich and never deletes assets from it. Caretakers cannot use the picker.

|                   | Default | Description                                                                                                                                                                                  |
| ----------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMMICH_URL`      | —       | Base URL of your Immich server, e.g. `http://immich.local:2283`. No trailing slash. Required if `IMMICH_API_KEY` is set.                                                                     |
| `IMMICH_API_KEY`  | —       | API key. Required permissions: `asset.read`, `asset.view`, plus `album.read` if `IMMICH_ALBUM_ID` is set. Generate in Immich → Account Settings → API Keys. Required if `IMMICH_URL` is set. |
| `IMMICH_ALBUM_ID` | —       | If set, the picker only shows assets in this album. If unset, the picker shows the user's most recent assets across the whole library.                                                       |

### SMTP email (optional)

When `SMTP_HOST` and `SMTP_FROM` are both set, EinVault enables outbound email and adds a self-service "Forgot password?" link on the login page. When SMTP is configured, users can also opt in (Settings -> Notifications) to an email when a reminder comes due, and to an email 24 hours before a caretaker shift starts or ends. Caretakers only receive reminder emails for companions assigned to them, and shift emails for their own shifts. Both variables must be set together; setting only one disables email and logs a warning at startup.

`ORIGIN` must be set correctly: password reset links are built from it. Behind a reverse proxy, make sure `ORIGIN` matches the public URL users see.

|               | Default | Description                                                                                                                     |
| ------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `SMTP_HOST`   | —       | SMTP server hostname. Required (with `SMTP_FROM`) to enable email.                                                              |
| `SMTP_PORT`   | `587`   | SMTP port. Use `465` with `SMTP_SECURE=true` for implicit TLS, or `587` (default) for STARTTLS.                                 |
| `SMTP_SECURE` | `false` | `true` = implicit TLS (port 465). `false` = STARTTLS upgrade on connect.                                                        |
| `SMTP_USER`   | —       | SMTP username. Leave unset for unauthenticated relays.                                                                          |
| `SMTP_PASS`   | —       | SMTP password. Leave unset for unauthenticated relays.                                                                          |
| `SMTP_FROM`   | —       | RFC 5322 From address shown to recipients, e.g. `EinVault <einvault@example.com>`. Required (with `SMTP_HOST`) to enable email. |

### ntfy push notifications (optional)

When `NTFY_URL` is set, EinVault can publish push notifications via [ntfy](https://ntfy.sh). This configures the server only (base URL and optional access token). Each user sets their own topic name under Settings -> Notifications; a non-empty topic is that user's opt-in for pushes scoped to what they can see in the app (reminders due, shift alerts). The notification scheduler runs when either SMTP or ntfy is configured. The forgot-password flow remains email-only.

On public servers like ntfy.sh, the topic name is the only access control. Users should pick long, random topic names that are hard to guess.

|              | Default | Description                                                                                              |
| ------------ | ------- | -------------------------------------------------------------------------------------------------------- |
| `NTFY_URL`   | —       | ntfy server base URL, e.g. `https://ntfy.sh` or a self-hosted instance. No topic in the URL.             |
| `NTFY_TOKEN` | —       | Bearer token for self-hosted ntfy servers with auth enabled. Used for every publish regardless of topic. |

### Data and backup

Data lives in `./data` next to the compose file. Stop the container first so SQLite isn't mid-write, then copy the directory:

```bash
docker compose -f docker-compose.prod.yml stop einvault
cp -r ./data ./data.bak
docker compose -f docker-compose.prod.yml start einvault
```

### Container hardening

|                     |                                         |
| ------------------- | --------------------------------------- |
| Runs as root        | No (runs as `node`, UID 1000)           |
| `no-new-privileges` | Enabled                                 |
| Linux capabilities  | All dropped                             |
| Root filesystem     | Read-only                               |
| Writable `/tmp`     | tmpfs, 64 MB                            |
| CPU limit           | 0.5 cores (raise for video transcoding) |
| Memory limit        | 256 MB (raise for video transcoding)    |

### Image tags

| Tag            | Description                                         |
| -------------- | --------------------------------------------------- |
| `latest`       | Latest stable release (published on version tags)   |
| `x.y.z`        | Pinned release                                      |
| `x.y`          | Latest patch of a minor release                     |
| `main`         | Latest commit on `main`, unstable, for testing only |
| `sha-<commit>` | Specific commit build, useful for rollback          |

### Verifying releases

Each release image carries a Sigstore-signed SLSA provenance attestation and a SPDX SBOM, and only ships after Trivy clears the OS and library packages on both `linux/amd64` and `linux/arm64`. See [SECURITY.md](SECURITY.md#verifying-releases) for the verification commands.

For tag selection:

- **`:latest`** is the lowest-friction default and what `docker-compose.prod.yml` uses. A `docker compose pull` will follow new releases automatically, so a hypothetical poisoned release would auto-deploy. Acceptable for casual homelab use, especially when paired with manual `gh attestation verify` before the pull.
- **`:vX.Y.Z`** pins to a specific release. Auto-updaters like Watchtower will not move past it. Recommended for production deployments.
- **`@sha256:<digest>`** pins to the exact bytes you verified. Immune to registry retags or future republishing. Recommended for hardened deployments.

---

## Docker (local build)

Builds the image locally instead of pulling from GHCR. Useful for testing Dockerfile changes or working on EinVault itself:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

All the same env vars work here. `ORIGIN` defaults to `http://localhost:3000` so no `.env` is needed for a basic smoke test.

---

## Local development

Requires Node.js 20+, npm 10+, and the native build tools for `better-sqlite3` and `sharp`:

- Debian/Ubuntu: `sudo apt install python3 g++ make`
- macOS: `brew install python3` (Xcode Command Line Tools provides g++ and make)

```bash
npm install
npm run db:generate   # generate migration files from the schema
npm run db:migrate    # apply migrations
npm run dev           # http://localhost:5173
```

No `.env` needed. The database defaults to `./data/einvault.db` and migrations run on startup. Open `http://localhost:5173` and you'll land on `/setup` to create your admin account.

### Commands

```bash
npm run dev            # dev server at http://localhost:5173
npm run build          # production build
npm run check          # SvelteKit type checking
npm run lint           # ESLint + Prettier check
npm run format         # auto-format with Prettier
npm run db:generate    # generate a migration file after schema changes
npm run db:migrate     # apply pending migrations
npm run db:studio      # Drizzle Studio (visual database browser)
```

When you change `src/lib/server/db/schema.ts`, run `db:generate` then `db:migrate` and commit both files together.

---

## User management

- First run redirects to `/setup` to create the initial admin account (one-time only)
- Manage users at `/admin/users`: create accounts, reset passwords, deactivate users
- No open registration

---

## OIDC / SSO (optional)

EinVault supports OpenID Connect for SSO with providers like Authelia, Authentik, Keycloak, and PocketID. OIDC runs alongside password login; existing users keep their passwords. A "Sign in with {provider}" button appears on the login page when OIDC is configured.

OIDC is **disabled** unless all required variables are set. Add them to your `.env` (local) or compose file (production), then restart.

Register `https://<your-domain>/auth/oidc/callback` as an allowed redirect URI with your IdP first.

### Required variables

| Variable             | Description                                                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `OIDC_ISSUER_URL`    | IdP base URL. Discovery happens at `<issuer>/.well-known/openid-configuration`. e.g. `https://auth.example.com` |
| `OIDC_CLIENT_ID`     | Client ID registered with your IdP.                                                                             |
| `OIDC_CLIENT_SECRET` | Client secret. Omit for public clients (PKCE-only).                                                             |
| `OIDC_REDIRECT_URI`  | Must match what's registered with the IdP. e.g. `https://einvault.yourdomain.com/auth/oidc/callback`            |

### Optional variables

| Variable                        | Default                | Description                                                                                                |
| ------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `OIDC_SCOPES`                   | `openid profile email` | Space-separated scopes requested from the IdP.                                                             |
| `OIDC_PROVIDER_NAME`            | `SSO`                  | Display label on the login button.                                                                         |
| `OIDC_ALLOW_SIGNUP`             | `false`                | If `true`, auto-creates accounts for users who authenticate but have no matching record. See below.        |
| `OIDC_DEFAULT_ROLE`             | `member`               | Role assigned to auto-created users. Allowed: `member`, `caretaker`. Admin can only be granted via groups. |
| `OIDC_ADMIN_GROUPS`             | _(unset)_              | Comma-separated. Users whose `groups` claim contains any value here are promoted to admin on every login.  |
| `OIDC_POST_LOGOUT_REDIRECT_URI` | _(unset)_              | If set and the IdP advertises `end_session_endpoint`, logout triggers RP-initiated logout at the IdP.      |
| `OIDC_STATE_SECRET`             | _(random)_             | Pin a long random string. Without it, in-flight logins break across server restarts.                       |

### Account linking

The callback decides which account to use in this order:

1. **Match by OIDC subject.** If the user has logged in via OIDC before, link by stored `(issuer, subject)`.
2. **Match by verified email.** If `email_verified` is `true` and the email matches an existing user, link the OIDC subject to that account.
3. **Auto-create.** Only if `OIDC_ALLOW_SIGNUP=true`. Username taken from `preferred_username` claim (sanitised, with numeric suffix on collision), or email local-part as fallback.
4. **Reject.** Otherwise, the user is returned to the login page with an "account not provisioned" message. An admin must create the account first.

By default (`OIDC_ALLOW_SIGNUP=false`), users must already exist in EinVault, or share an email with an existing account, to log in.

### Admin role mapping

If `OIDC_ADMIN_GROUPS` is set, the user's `groups` claim is checked on **every** login. Membership in any listed group sets the user's role to `admin`; absence demotes them to the default role. Revoking admin at the IdP takes effect on next login.

If `OIDC_ADMIN_GROUPS` is unset, OIDC does not touch user roles. Roles set in EinVault's admin UI are preserved across SSO logins.

`OIDC_DEFAULT_ROLE` cannot grant admin; allowed values are `member` and `caretaker`.

Group membership is read from the top-level `groups` claim in the ID token, as an array of strings (a single string also works). Other claim names (`roles`, Keycloak's `realm_access.roles`) and nested claims aren't read. Configure your IdP to emit `groups` directly. See provider notes below.

### Logout

By default, logout destroys the local EinVault session and returns the user to `/auth/login`. Set `OIDC_POST_LOGOUT_REDIRECT_URI` (and register it with your IdP) to also end the IdP session via [RP-initiated logout](https://openid.net/specs/openid-connect-rpinitiated-1_0.html).

### Provider notes

| Provider      | Notes                                                                                                                                                                                               |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Authelia**  | Register the redirect URI under the OIDC client config. Set `client_secret_basic` (default) or `none` for public clients.                                                                           |
| **Authentik** | Create an OAuth2/OIDC provider; scope mapping for `groups` is built-in. `OIDC_ADMIN_GROUPS` matches the `groups` claim directly.                                                                    |
| **Keycloak**  | Add a "Group Membership" mapper to the client with token claim name `groups` and "Full group path" off. EinVault does not read `realm_access.roles`. Add the redirect URI to "Valid Redirect URIs". |
| **PocketID**  | Public-client first; omit `OIDC_CLIENT_SECRET`. Register the redirect URI in the client settings.                                                                                                   |

---

## Adding a new locale

1. Copy `src/lib/i18n/en.ts` to `src/lib/i18n/{code}.ts` (e.g. `ja.ts`) and translate every value. The file must `export default { ... } satisfies Record<keyof Messages, string>` — the compiler will catch any missing keys.
2. In `src/lib/i18n/index.ts`: import the new file, add the code to the `Locale` type, `SUPPORTED_LOCALES`, `LOCALE_LABELS`, and `catalogs`.
3. In `src/lib/server/db/schema.ts`: add the code to the `locale` enum on the `users` table.

No migration is needed — SQLite text columns don't enforce enums at the database level.

> **Note:** Non-English translations were generated by Claude (Anthropic) and may contain errors. Corrections via pull request are welcome.

---

## Stack

- **SvelteKit:** full-stack TypeScript framework with file-based routing
- **SQLite + Drizzle ORM:** local-first, portable database
- **Tailwind CSS:** utility-first styling with custom components
- **Session-based auth:** custom sessions with bcryptjs password hashing; optional OIDC SSO via [`openid-client`](https://github.com/panva/openid-client)
- **Docker:** multi-stage, hardened single-container deployment

---

## License

MIT. See [LICENSE](LICENSE).
