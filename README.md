# Appaloft

Appaloft is an AI-native local-to-cloud deployment platform for developers who want to deploy local workspaces, local Git repositories, GitHub repositories, zip archives, Docker images, or Compose bundles onto their own servers.

The system is backend-first and interface-agnostic:

- `CLI`, `HTTP API`, and future `MCP tools` are first-class entry points
- the web console is a static interface, not the product core
- the deployment runtime, environment model, and planning pipeline live in the backend

## Current Milestone

Milestone 1 is implemented:

- Bun + TypeScript strict monorepo with Turborepo
- `apps/shell` bootstraps the backend runtime and CLI
- `apps/web` builds as a static SvelteKit app
- `apps/web` consumes the backend through `@appaloft/orpc/client` and `@tanstack/svelte-query`
- Elysia serves `/api/health`, `/api/readiness`, `/api/version`, project/server/environment/deployment APIs
- CLI supports `serve`, `doctor`, `db migrate`, `project`, `server`, `deploy`, `rollback`, `env`, `plugins`, `providers`
- Kysely persistence is wired with migrations for external PostgreSQL and embedded PGlite modes
- default self-hosted mode stays anonymous with no required login
- hosted control-plane mode adds first-party Better Auth runtime support and can still load operator-installed system plugins
- environment snapshots, masking, promote, and diff exist in the domain/application model
- a hermetic fake execution backend drives deployment state, logs, and rollback flows
- GitHub integration and Generic SSH provider skeletons exist
- release artifacts, Dockerfile, Compose files, tests, and GitHub Actions are included

## Quick Start

1. Install dependencies.

```bash
bun install
```

2. Choose a database mode.

```bash
# embedded PGlite is now the default local dev mode
export APPALOFT_DATABASE_DRIVER=pglite

# or external PostgreSQL
# docker compose -f docker-compose.dev.yml up -d
# export APPALOFT_DATABASE_DRIVER=postgres
# export APPALOFT_DATABASE_URL=postgres://postgres:postgres@localhost:5432/appaloft
```

3. Apply migrations.

```bash
bun run db:migrate
```

4. Start the backend.

```bash
bun run serve
```

5. Start the web interface in another terminal.

```bash
bun --cwd apps/web run dev
```

## Build And Package

```bash
bun run build
bun run package:binary-bundle
bun run package:artifacts
bun run checksums
docker build -t appaloft-all-in-one:local .
```

Release outputs currently target:

- `appaloft-backend`
- `appaloft-web-static`
- `appaloft-binary-bundle`
- `Dockerfile` for `appaloft-all-in-one`
- `docker-compose.selfhost.yml`
- `release-manifest.json`
- `checksums.txt`

## Runtime Shapes

Appaloft is intentionally not single-shape:

- split deployment: static frontend + standalone backend
- all-in-one Docker image
- self-hosted Docker Compose bundle
- future optional binary mode

Important:

- optional binary distribution is only a packaging form
- PostgreSQL remains the primary hosted/production backend
- PGlite is supported for embedded single-instance installs and defaults to the platform user data
  directory; set `APPALOFT_DATA_DIR=.appaloft/data` only when you want portable workspace-local state
- hosted auth and tenant features are additive, not mandatory for local/self-hosted use
- `appaloft-binary-bundle` now packages a single Bun-compiled executable with embedded web console assets and embedded PGlite runtime assets

## Repository Layout

```text
apps/
  shell/   backend composition root, runtime entry, CLI
  web/     static SvelteKit console
packages/
  core/ application/ contracts/ config/ observability/
  persistence/pg/
  adapters/{http-elysia,cli,filesystem,runtime,packaging}/
  providers/{core,generic-ssh,aliyun,tencent}/
  integrations/{core,github,gitlab}/
  plugins/{sdk,host,builtins}/
  ai/mcp/
  testkit/
  ui/
docs/
  architecture, environments, testing, operations, release, security, ADRs
```

## Documentation

- [Chinese README](./README.zh-CN.md)
- [Bootstrap](./docs/BOOTSTRAP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Environments](./docs/ENVIRONMENTS.md)
- [Plugins](./docs/PLUGINS.md)
- [Providers](./docs/PROVIDERS.md)
- [Testing](./docs/TESTING.md)
- [Operations](./docs/OPERATIONS.md)
- [Release](./docs/RELEASE.md)
- [Security](./docs/SECURITY.md)
- [AGENTS rules](./AGENTS.md)

## License

MIT
