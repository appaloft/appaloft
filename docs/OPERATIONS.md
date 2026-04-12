# Operations

## Local Development

Embedded PGlite is the default local development mode:

```bash
export YUNDU_DATABASE_DRIVER=pglite
export YUNDU_DATA_DIR=.yundu/data
export YUNDU_PGLITE_DATA_DIR=.yundu/data/pglite
```

External PostgreSQL:

```bash
docker compose -f docker-compose.dev.yml up -d
export YUNDU_DATABASE_DRIVER=postgres
export YUNDU_DATABASE_URL=postgres://postgres:postgres@localhost:5432/yundu
```

Apply migrations:

```bash
bun run db:migrate
```

Run the local web console and backend together:

```bash
bun run dev
```

This root command starts only `apps/shell` and `apps/web`, not the desktop app. Open:

```text
http://localhost:3001
```

By default the Vite dev server listens on port `3001`, the backend listens on port `3002`, and Vite
proxies `/api` to the backend. Override the dev-only ports with `YUNDU_DEV_WEB_PORT` and
`YUNDU_DEV_BACKEND_PORT` when needed. Override the public browser origin used for OAuth callbacks
with `YUNDU_DEV_WEB_ORIGIN`.

Run backend only:

```bash
bun run serve
```

Build binary bundle:

```bash
bun run package:binary-bundle
./dist/release/yundu-binary-bundle/run-yundu.sh db migrate
./dist/release/yundu-binary-bundle/run-yundu.sh serve
```

The binary bundle is self-contained:

- the web console static assets are embedded into the executable
- the PGlite fs bundle and wasm modules are embedded into the executable
- `YUNDU_WEB_STATIC_DIR` remains available only as an override for an external web build

Run the Tauri desktop shell:

```bash
bun run desktop:dev
```

This still uses the same binary bundle as the backend. Tauri packaging requires a Rust toolchain;
keep `yundu-binary-bundle` as the deployment artifact.

Hosted control-plane mode with first-party Better Auth runtime:

```bash
export YUNDU_RUNTIME_MODE=hosted-control-plane
export YUNDU_BETTER_AUTH_URL=http://localhost:3001
export YUNDU_BETTER_AUTH_SECRET=change-me-in-production
export YUNDU_GITHUB_CLIENT_ID=...
export YUNDU_GITHUB_CLIENT_SECRET=...
```

GitHub repository import uses a deferred OAuth flow. The operator can open the console without
signing in, then authorize only after choosing a GitHub source in the deploy flow. Create a GitHub
OAuth App in GitHub developer settings and set its authorization callback URL to:

```text
<YUNDU_BETTER_AUTH_URL>/api/auth/callback/github
```

For local development with the default backend URL, that is:

```text
http://localhost:3001/api/auth/callback/github
```

The OAuth App cannot be fully created in Yundu source code because GitHub issues the client id and
client secret. Yundu reads those values from `YUNDU_GITHUB_CLIENT_ID` and
`YUNDU_GITHUB_CLIENT_SECRET`, then stores Better Auth users, sessions, linked accounts, and provider
tokens in the configured Postgres-compatible database.

Run web only:

```bash
YUNDU_WEB_DEV_PROXY_TARGET=http://127.0.0.1:3002 bun --cwd apps/web run dev -- --port 3001 --strictPort
```

Default web behavior:

- the browser talks to `/api` on the same origin
- in local development, Vite proxies `/api` to `YUNDU_WEB_DEV_PROXY_TARGET`
- in deployed mode, the backend serves static assets and `/api` from the same origin
- only set `VITE_YUNDU_API_BASE_URL` when you intentionally want the web app to target a different
  external API origin

## Static Frontend Deployment

`apps/web/build` can be deployed to:

- Nginx
- CDN/object storage
- any static hosting platform

The web app defaults to same-origin `/api`.

Use `VITE_YUNDU_API_BASE_URL` only for split deployments where static assets and API live on
different origins.

## All-In-One Docker

```bash
docker build -t yundu-all-in-one:local .
docker run --rm -p 3001:3001 \
  -e YUNDU_DATABASE_URL=postgres://... \
  -e YUNDU_WEB_STATIC_DIR=/app/web \
  yundu-all-in-one:local
```

## Self-Hosted Compose

Recommended path:

```bash
docker compose -f docker-compose.selfhost.yml up -d --build
```

## PostgreSQL

- required for CI integration/E2E
- required for hosted control plane
- required for self-hosted production
- optional for local-first embedded installs that use `YUNDU_DATABASE_DRIVER=pglite`
- auth is not required for self-hosted/local mode
- hosted auth and tenant features are activated by runtime mode and config, not by end-user plugin installation

Binary distribution does not imply embedded storage by default. Embedded mode is an explicit runtime choice.

## Embedded PGlite

- suited for portable installs that keep Yundu state inside the workspace, for example `.yundu/data/pglite`
- suited for single-instance operation
- not the recommended backend for multi-process hosted control planes
- keep backups by copying the embedded data directory while the app is stopped
- the binary bundle launcher defaults to `pglite` and writes data to `$PWD/.yundu/data` unless overridden
- a fully self-contained binary can still target external PostgreSQL by setting `YUNDU_DATABASE_DRIVER=postgres`

## Local Manual Validation

Yundu now supports a first-party `local-shell` deploy target for manual validation on the current
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
`dockerfile` plans, Yundu materializes the source on the control-plane machine first: GitHub and
other remote git sources are cloned into the runtime directory, then the prepared workspace is
uploaded to the SSH host and built there. For `prebuilt-image` plans, Yundu skips git/source
materialization and runs the image directly on the SSH host.

The SSH target must already allow non-interactive SSH from the machine running Yundu and have Docker
installed. The server `host` may include a user, for example `root@203.0.113.10`.

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

bun run --cwd apps/shell src/index.ts deploy https://github.com/nichenqin/yundu-express-hello.git \
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
