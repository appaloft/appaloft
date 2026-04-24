# Operations

## Local Development

Embedded PGlite is the default local development mode:

```bash
export APPALOFT_DATABASE_DRIVER=pglite
```

When `APPALOFT_DATA_DIR` is not set, Appaloft stores embedded data in the platform user data directory:
`~/Library/Application Support/Appaloft/data` on macOS, `$XDG_DATA_HOME/appaloft/data` or
`~/.local/share/appaloft/data` on Linux, and `%APPDATA%\Appaloft\data` on Windows. Set
`APPALOFT_DATA_DIR=.appaloft/data` and `APPALOFT_PGLITE_DATA_DIR=.appaloft/data/pglite` only when you
intentionally want portable workspace-local state.

External PostgreSQL:

```bash
docker compose -f docker-compose.dev.yml up -d
export APPALOFT_DATABASE_DRIVER=postgres
export APPALOFT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/appaloft
```

Apply migrations:

```bash
bun run db:migrate
```

Run the local web console, public docs, and backend together:

```bash
bun run dev
```

This root command starts `apps/shell`, `apps/web`, and `apps/docs`, not the desktop app. Open the Web
URL printed by Vite. Web dev keeps `/docs/*` links working by redirecting them to the local Docs dev
server.

By default Vite proxies `/api` to `APPALOFT_WEB_DEV_PROXY_TARGET`. Override `APPALOFT_HTTP_PORT` for
the backend, `APPALOFT_WEB_DEV_PROXY_TARGET` for Web-to-backend development traffic, and
`APPALOFT_WEB_ORIGIN` for the public browser origin used by OAuth callbacks. If the local Docs dev
server uses a non-default address, set `APPALOFT_DEV_DOCS_HOST` / `APPALOFT_DEV_DOCS_PORT`, or set
`APPALOFT_WEB_DEV_DOCS_TARGET` to override the full Web redirect target.

Run backend only:

```bash
bun run serve
```

Build binary bundle:

```bash
bun run package:binary-bundle
./dist/release/appaloft-binary-bundle/run-appaloft.sh db migrate
./dist/release/appaloft-binary-bundle/run-appaloft.sh serve
```

The binary bundle is self-contained:

- the web console static assets are embedded into the executable
- the public documentation static assets are embedded into the executable
- the PGlite fs bundle and wasm modules are embedded into the executable
- `APPALOFT_WEB_STATIC_DIR` remains available only as an override for an external web build
- `APPALOFT_DOCS_STATIC_DIR` remains available only as an override for an external docs build

## Docs Deployment

Production docs deploys run from `.github/workflows/deploy-docs.yml` on `main` and use
`appaloft.docs.yml` to deploy `docs.appaloft.com` through the Appaloft CLI itself.

PR docs previews run from `.github/workflows/deploy-docs-preview.yml`. The preview job runs only for
same-repository pull requests whose changed files affect docs content, the docs app, or docs build
inputs. It invokes:

```bash
appaloft deploy . \
  --config appaloft.docs.yml \
  --preview pull-request \
  --preview-id pr-<number> \
  --preview-domain-template docs-pr-<number>.preview.appaloft.com \
  --preview-tls-mode disabled \
  --require-preview-url
```

The close job runs `appaloft preview cleanup` on `pull_request.closed`. Cleanup is idempotent, so it
is allowed to run for same-repository PRs even if the final file list no longer contains docs
changes.

Required GitHub repository settings:

- variable `APPALOFT_SSH_HOST`
- optional variable `APPALOFT_SSH_USER` (defaults to `root`)
- secret `APPALOFT_SSH_PRIVATE_KEY`

Docs previews use hosts shaped as `docs-pr-<number>.preview.appaloft.com`, matching the existing
`*.preview.appaloft.com` wildcard preview domain used by `appaloft/www`. Preview docs use HTTP with
TLS disabled at the Appaloft route layer.

Run the Tauri desktop shell:

```bash
bun run desktop:dev
```

This still uses the same binary bundle as the backend. Tauri packaging requires a Rust toolchain;
keep `appaloft-binary-bundle` as the deployment artifact.

Hosted control-plane mode with first-party Better Auth runtime:

```bash
export APPALOFT_RUNTIME_MODE=hosted-control-plane
export APPALOFT_BETTER_AUTH_URL=http://localhost:3001
export APPALOFT_BETTER_AUTH_SECRET=change-me-in-production
export APPALOFT_GITHUB_CLIENT_ID=...
export APPALOFT_GITHUB_CLIENT_SECRET=...
```

Deployment control-plane selection is separate from execution ownership. A repository may continue
to execute deploys from GitHub Actions while selecting no control plane, Appaloft Cloud, or a
self-hosted Appaloft server as the state owner. Until the ADR-025 control-plane resolver is
implemented, this is the target product contract rather than an available config field:

```yaml
controlPlane:
  mode: none
```

Future self-hosted/cloud-assisted deployments will select control-plane mode through repository
config plus trusted CLI/action/env overrides. Tokens, database URLs, SSH keys, and Appaloft
project/resource/server ids must stay outside committed config.

GitHub repository import uses a deferred OAuth flow. The operator can open the console without
signing in, then authorize only after choosing a GitHub source in the deploy flow. Create a GitHub
OAuth App in GitHub developer settings and set its authorization callback URL to:

```text
<APPALOFT_BETTER_AUTH_URL>/api/auth/callback/github
```

For local development with the default backend URL, that is:

```text
http://localhost:3001/api/auth/callback/github
```

The OAuth App cannot be fully created in Appaloft source code because GitHub issues the client id and
client secret. Appaloft reads those values from `APPALOFT_GITHUB_CLIENT_ID` and
`APPALOFT_GITHUB_CLIENT_SECRET`, then stores Better Auth users, sessions, linked accounts, and provider
tokens in the configured Postgres-compatible database.

Run web only:

```bash
APPALOFT_WEB_DEV_PROXY_TARGET=http://127.0.0.1:3002 bun --cwd apps/web run dev -- --port 3001 --strictPort
```

Default web behavior:

- the browser talks to `/api` on the same origin
- in local development, Vite proxies `/api` to `APPALOFT_WEB_DEV_PROXY_TARGET`
- in deployed mode, the backend serves static assets and `/api` from the same origin
- only set `VITE_APPALOFT_API_BASE_URL` when you intentionally want the web app to target a different
  external API origin

## Static Frontend Deployment

`apps/web/build` can be deployed to:

- Nginx
- CDN/object storage
- any static hosting platform

The web app defaults to same-origin `/api`.

Use `VITE_APPALOFT_API_BASE_URL` only for split deployments where static assets and API live on
different origins.

## All-In-One Docker

```bash
docker build -t appaloft-all-in-one:local .
docker run --rm -p 3001:3001 \
  -e APPALOFT_DATABASE_URL=postgres://... \
  -e APPALOFT_WEB_STATIC_DIR=/app/web \
  -e APPALOFT_DOCS_STATIC_DIR=/app/docs \
  appaloft-all-in-one:local
```

For Traefik-managed application routes, a running Appaloft backend service can register its public
resource access failure page with the proxy it manages. When the backend listens on a wildcard host,
Appaloft derives a Docker host-gateway URL for Traefik automatically. For custom topologies, set
`APPALOFT_RESOURCE_ACCESS_FAILURE_RENDERER_URL` to an HTTP URL that the edge proxy container can
reach. One-shot CLI remote SSH deployments do not install this dynamic renderer because no
Appaloft backend service remains running after the command exits.

## Self-Hosted Compose

Recommended path:

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

The public `https://appaloft.com/install.sh` quick-start script is the Docker self-host installer.
It installs or verifies Docker Engine plus the compose plugin on Linux, writes the Compose stack and
environment file under `/opt/appaloft`, and starts Appaloft with PostgreSQL.

`install.sh` is authored in the Appaloft main repository and published as a GitHub Release asset.
The website route should redirect or proxy to
`https://github.com/appaloft/appaloft/releases/latest/download/install.sh` rather than copying from a
local checkout during the website build.

For production hosts with stricter package-management requirements, install Docker Engine through
Docker's official package repository first, then run:

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --skip-docker-install
```

To run the checked-in self-host Compose file directly:

```bash
APPALOFT_IMAGE_REF=ghcr.io/appaloft/appaloft:latest docker compose -f docker-compose.selfhost.yml up -d
```

## PostgreSQL

- required for CI integration/E2E
- required for hosted control plane
- required for self-hosted production
- optional for local-first embedded installs that use `APPALOFT_DATABASE_DRIVER=pglite`
- auth is not required for self-hosted/local mode
- hosted auth and tenant features are activated by runtime mode and config, not by end-user plugin installation

Binary distribution does not imply embedded storage by default. Embedded mode is an explicit runtime choice.

## Embedded PGlite

- stores data in the platform user data directory by default
- can be made portable by setting `APPALOFT_DATA_DIR=.appaloft/data` and
  `APPALOFT_PGLITE_DATA_DIR=.appaloft/data/pglite`
- suited for single-instance operation
- not the recommended backend for multi-process hosted control planes
- keep backups by copying the embedded data directory while the app is stopped
- the binary bundle launcher defaults to `pglite` and follows the same user-level data directory
  default unless overridden
- a fully self-contained binary can still target external PostgreSQL by setting `APPALOFT_DATABASE_DRIVER=postgres`

## Local Manual Validation

Appaloft now supports a first-party `local-shell` deploy target for manual validation on the current
machine.

Available deployment methods:

- `workspace-commands`
  - explicit host-process deployment
  - examples: `npm install`, `npm run build`, `npm run start`
- `dockerfile`
  - build a Docker image from the workspace and run it locally
- `docker-compose`
  - run a compose stack locally
- `prebuilt-image`
  - run an existing image locally

`generic-ssh` deploy targets support Docker container execution on a remote Linux host. For
`dockerfile` plans, Appaloft materializes the source on the control-plane machine first: GitHub and
other remote git sources are cloned into the runtime directory, then the prepared workspace is
uploaded to the SSH host and built there. For `prebuilt-image` plans, Appaloft skips git/source
materialization and runs the image directly on the SSH host.

The SSH target must have Docker installed. For authentication, a target can either use the local SSH
agent/config available to the Appaloft process or store an SSH private key on the server record. The
server `host` may include a user, for example `root@203.0.113.10`; alternatively set the login user
on the credential. The stored public key is descriptive, while the private key is what SSH uses.

Quick smoke against the included Express demo:

```bash
bun run smoke:local:commands
bun run smoke:local:docker
```

Those scripts print:

- the deployed app URL
- the deployment id
- the preserved embedded PGlite data directory
- the exact rollback command

Manual CLI flow for a local-shell target:

```bash
bun run db:migrate
bun run --cwd apps/shell src/index.ts project create --name "Local Demo"
bun run --cwd apps/shell src/index.ts server register --name local --host 127.0.0.1 --provider local-shell
bun run --cwd apps/shell src/index.ts env create --project <projectId> --name local --kind local

bun run --cwd apps/shell src/index.ts deploy examples/express-hello \
  --project <projectId> \
  --server <serverId> \
  --environment <environmentId> \
  --method workspace-commands \
  --build "npm run build" \
  --start "npm run start:built" \
  --port 4310 \
  --health-path /health
```

Manual CLI flow for a generic SSH Dockerfile target. For a private GitHub repository, prefer the web
flow after GitHub OAuth sign-in so the request-scoped token can be used during materialization; CLI
deployments need the git URL to be accessible from the local git environment.

```bash
bun run --cwd apps/shell src/index.ts server register --name ssh-demo --host root@<server-ip> --provider generic-ssh
bun run --cwd apps/shell src/index.ts server credential <serverId> --kind ssh-private-key --username root --private-key-file ~/.ssh/appaloft_demo

bun run --cwd apps/shell src/index.ts deploy https://github.com/nichenqin/appaloft-express-hello.git \
  --project <projectId> \
  --server <serverId> \
  --environment <environmentId> \
  --method dockerfile \
  --port 4310 \
  --health-path /health
```

Manual CLI flow for a generic SSH prebuilt image target:

```bash
bun run --cwd apps/shell src/index.ts deploy ghcr.io/<owner>/<image>:<tag> \
  --project <projectId> \
  --server <serverId> \
  --environment <environmentId> \
  --method prebuilt-image \
  --port 4310 \
  --health-path /health
```

## Hosted Auth

- Better Auth is mounted as a first-party runtime capability
- it mounts Better Auth under `/api/auth/*`
- GitHub OAuth stays deferred until the operator selects a GitHub-based source or flow
- the current milestone uses Better Auth as the internal auth foundation and reserves the organization plugin path for future tenant/organization isolation
- system plugins may still add hosted-only control-plane pages or middleware, but they do not own the primary login/session contract

## Runtime Directories

Planned runtime layout:

- `runtime/config/`
- `runtime/logs/`
- `runtime/plugins/`
- `runtime/migrations/`
- `runtime/scripts/`
- `runtime/public/`
- `runtime/compose/`

## Backups

Back up PostgreSQL with standard Postgres tooling:

- logical dump for metadata
- volume or physical backup for larger instances

## Restore

1. restore PostgreSQL
2. start backend with matching config
3. verify `/api/readiness`

## Upgrade

1. deploy new backend/static artifacts
2. run migrations
3. verify readiness and version
4. only then switch traffic
