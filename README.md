<div align="center">
  <a href="https://www.appaloft.com">
    <img src="./apps/web/src/lib/assets/appaloft-logo-horizontal.svg" alt="Appaloft" width="360" />
  </a>

  <p><code>/ˌæp əˈlɔːft/</code></p>
  <h3>Open-source Railway alternative.</h3>
  <p>
    Two doors: <strong>Deploy</strong> a folder to a live URL (Git optional), or
    <strong>Agent</strong> — teach Cursor, OpenCode, and the other detected hosts you already use.
  </p>
</div>

```bash
appaloft up
```

```bash
appaloft setup agent
```

If you are not logged in, you will be asked to log in.

<div align="center">
  <p>
    <a href="https://www.appaloft.com">Website</a> ·
    <a href="https://docs.appaloft.com/en">Docs</a> ·
    <a href="https://www.appaloft.com/compare/railway">Compare Railway</a> ·
    <a href="https://github.com/appaloft/appaloft/releases/latest">Releases</a> ·
    <a href="./README.zh-CN.md">中文</a>
  </p>
  <p>
    That is positioning, not a 1:1 swap. The
    <a href="https://www.appaloft.com/compare/railway">Compare Railway</a>
    FAQ is explicit: Appaloft is not a complete Railway replacement.
  </p>
</div>

<p align="center">
  <img src="./docs/assets/appaloft-deploy-loop.gif" alt="Appaloft deploy, health verification, and public URL terminal demo" width="920" />
</p>

Deploy from a folder, Git URL, image, Compose file, or zip is available today. Agent Workspace and
Sandbox surfaces are public alpha. That is an honesty line, not a formal correctness or compliance
claim.

## Install

Install the CLI first. You do not need the self-hosted stack to deploy.

```bash
npm install -g @appaloft/cli
```

```bash
brew install appaloft/tap/appaloft
```

Or download a platform archive from
[GitHub Releases](https://github.com/appaloft/appaloft/releases/latest).

If you bring your own machine, register it with `appaloft server register`. For a self-hosted
plane, pass `--url` when you log in.

## Up

From any project folder. Git is optional. A folder is enough. Success is a live URL for this app.

```bash
appaloft up
```

If the folder has `public/index.html`, `appaloft up --yes` auto-selects static.
`appaloft deploy` remains the supported 1.x compatibility spelling for the same workflow.

Optional one-file config:

```yaml
name: my-app
source:
  path: .
runtime:
  method: workspace-commands
  installCommand: bun install --frozen-lockfile
  buildCommand: bun run build
  startCommand: bun run start
network:
  internalPort: 3000
access:
  default: public
```

```bash
appaloft up --config appaloft.yml
```

The same command accepts a folder, a Git URL, a container image, a Compose file, or a zip:

```bash
appaloft init
appaloft up
appaloft up ./dist --config appaloft.yml
appaloft up https://github.com/acme/web.git
appaloft up ghcr.io/acme/api:1.7.3
appaloft up ./docker-compose.yml
```

Want a known-good sample? Try the official
[`appaloft/examples/hello`](https://github.com/appaloft/examples/tree/main/hello) project after the
CLI is installed. It is optional — not the first command.

## Agent

`appaloft setup agent` teaches Cursor, OpenCode, and the other detected hosts you already have.
That is the Agent door.

```bash
appaloft setup agent
```

It copies byte-identical skills and writes token-free Local MCP into detected hosts. Universal is
skills only (`~/.agents`). Cursor and Claude Code get skill plus MCP when `~/.cursor` or `~/.claude`
exist. OpenCode is listed but not default-checked; pass `--agent opencode` or use a sibling
install. The MCP launcher reuses the Appaloft login profile
(`appaloft mcp remote-stdio --profile <active>`). Tokens stay out of editor config.

```bash
# Explicit MCP siblings (OpenCode is explicit)
appaloft auth mcp cursor install
appaloft auth mcp claude-code install
appaloft auth mcp opencode install
```

Skill-only and MCP launcher notes (secondary): `npx skills add` only copies the skill. It does not
install the CLI or write MCP config.

```bash
npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes
npx skills add appaloft/appaloft --skill appaloft --global --agent claude-code --copy --yes
npx skills add appaloft/appaloft --skill appaloft --global --agent cursor --copy --yes
npx skills add appaloft/appaloft --skill appaloft --global --agent opencode --copy --yes
```

```bash
npx @appaloft/mcp
appaloft mcp stdio
```

Verify a skill-manager copy with `npx skills list --global --agent <agent>`, then start a new
agent session. Ask it to deploy or operate through Appaloft. The skill tells the agent to use
Appaloft operations instead of calling Docker, SSH, databases, or cloud providers directly.
This is the public-repo CLI Agent door — not a Cloud marketing-site claim.

## Self-host (optional)

The Linux control-plane installer is optional. Do not start here unless you want to run Appaloft
yourself.

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

Pin a release version:

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 1.9.2
```

The installer verifies or installs Docker Engine and the Compose plugin, writes the stack to
`/opt/appaloft`, and starts the Appaloft backend, static console, and PostgreSQL.

| Surface | Command |
| --- | --- |
| npm CLI | `npm install -g @appaloft/cli` |
| Homebrew CLI | `brew install appaloft/tap/appaloft` |
| GitHub Release | Download platform archives from [latest releases](https://github.com/appaloft/appaloft/releases/latest). |
| MCP launcher | `npx @appaloft/mcp` |
| Local Agent door | `appaloft setup agent` |
| AI skill | `npx skills add appaloft/appaloft --skill appaloft --global --agent codex --copy --yes` |
| Self-hosted server | `curl -fsSL https://appaloft.com/install.sh \| sudo sh` |
| Self-hosted with PGlite | `curl -fsSL https://appaloft.com/install.sh \| sudo sh -s -- --database pglite` |
| Self-hosted with a domain | `curl -fsSL https://appaloft.com/install.sh \| sudo sh -s -- --domain console.example.com` |
| Docker image | `docker pull ghcr.io/appaloft/appaloft:latest` |
| Source checkout | `bun install && bun run --cwd apps/shell src/index.ts --help` |

## Common CLI

Deploy, observe, and recover. Full command list:
[skills/appaloft/references/cli-entrypoints.md](./skills/appaloft/references/cli-entrypoints.md).

```bash
appaloft --version
appaloft auth status
appaloft context show

appaloft up
appaloft deployments list
appaloft deployments show <deploymentId>
appaloft deployments timeline <deploymentId> --follow --json
appaloft deployments retry <deploymentId>
appaloft deployments redeploy <resourceId>
appaloft deployments rollback <deploymentId> --candidate <deploymentId>

appaloft resource logs <resourceId>
appaloft resource health <resourceId>
appaloft work list
appaloft work watch <workId> --json

appaloft server register
appaloft server list
appaloft server test <serverId>
```

## GitHub Actions

Use the bundled deploy action when CI should deploy over pure SSH or through a self-hosted Appaloft
control plane:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: appaloft/appaloft/.github/actions/deploy-action@main
        with:
          source: .
          ssh-host: ${{ secrets.APPALOFT_SSH_HOST }}
          ssh-user: root
          ssh-private-key: ${{ secrets.APPALOFT_SSH_PRIVATE_KEY }}
```

## Local Development

```bash
bun install
export APPALOFT_DATABASE_DRIVER=pglite
bun run db:migrate
bun run dev
```

For PostgreSQL local development, start `docker-compose.dev.yml` and set
`APPALOFT_DATABASE_DRIVER=postgres` plus `APPALOFT_DATABASE_URL`.

```bash
bun run lint:ci
bun run typecheck
bun run test
bun run build
bun run smoke:local:static
```

## Repository Map

| Path | Purpose |
| --- | --- |
| `apps/shell` | CLI and local server runtime entrypoint. |
| `apps/dashboard` | Default contextual Dashboard and static console. |
| `apps/web` | Retained legacy console for explicit rollback. |
| `apps/docs` | Public documentation site. |
| `packages/application` | Command/query handlers and operation catalog. |
| `packages/adapters` | CLI, HTTP, persistence, runtime, and provider adapters. |
| `packages/ai/mcp` | MCP server transport. |
| `packages/npm` | npm CLI and MCP launcher packages. |
| `skills/appaloft` | AI-facing Appaloft skill and references. |
| `docs` | Architecture, operations, ADRs, specs, and release docs. |

## Documentation

- [Docs](https://docs.appaloft.com/en)
- [First deployment](https://docs.appaloft.com/en/start/first-deployment/)
- [Agents](https://docs.appaloft.com/en/agents/overview/)
- [TypeScript SDK](https://docs.appaloft.com/en/reference/typescript-sdk/)
- [Self-hosting install](https://docs.appaloft.com/en/self-hosting/install/)
- [Architecture](./docs/ARCHITECTURE.md)
- [Core operations](./docs/CORE_OPERATIONS.md)
- [MCP server](./docs/agent/appaloft-mcp-server.md)
- [Providers](./docs/PROVIDERS.md)
- [Plugins](./docs/PLUGINS.md)
- [Testing](./docs/TESTING.md)
- [Release](./docs/RELEASE.md)
- [Security](./docs/SECURITY.md)
- [Agent rules](./AGENTS.md)

## License

Apache-2.0.

The open source edition covers this repository's source code. Appaloft Cloud and other hosted
service-specific code may be distributed separately under different terms.

The Appaloft name, logo, and related brand assets are not granted by the Apache-2.0 license; see
[TRADEMARKS.md](./TRADEMARKS.md).
