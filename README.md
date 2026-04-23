<div align="center">
  <img src="./apps/web/src/lib/assets/appaloft-mark.svg" alt="Appaloft logo" width="360" />
  <p><code>/ˌæp əˈlɔːft/</code></p>
  <p><strong>From localhost to cloud.</strong></p>
  <p>
    AI-native deployment control plane for shipping local folders, Git repos, Docker images,
    and Compose apps to your own servers.
  </p>
  <p>
    <a href="https://www.appaloft.com/en-US/">Website</a> ·
    <a href="./README.zh-CN.md">中文</a> ·
    <a href="./docs/BOOTSTRAP.md">Docs</a> ·
    <a href="https://github.com/appaloft/appaloft/releases/latest">Download</a>
  </p>
</div>

## Quick Start

> Fastest path: install the self-hosted stack on a Linux server or VM.

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

Pin a release version:

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --version 0.2.1
```

This installer verifies or installs Docker Engine and the Compose plugin, writes the self-hosted
stack to `/opt/appaloft`, and starts the Appaloft backend, static console, and PostgreSQL.

## Why Appaloft

- Deploy local folders, local Git repos, GitHub repos, zip archives, Docker images, or Compose bundles.
- Keep `CLI`, `HTTP API`, and future `MCP tools` as first-class interfaces.
- Run deployments as a backend workflow: `detect -> plan -> execute -> verify -> rollback`.
- Use the web app as a static console, not as the business core.

## Local Development

```bash
bun install
export APPALOFT_DATABASE_DRIVER=pglite
bun run db:migrate
bun run dev
```

For PostgreSQL local development, start `docker-compose.dev.yml` and set
`APPALOFT_DATABASE_DRIVER=postgres` plus `APPALOFT_DATABASE_URL`.

## Documentation

- [Bootstrap](./docs/BOOTSTRAP.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Core operations](./docs/CORE_OPERATIONS.md)
- [Providers](./docs/PROVIDERS.md)
- [Plugins](./docs/PLUGINS.md)
- [Testing](./docs/TESTING.md)
- [Release](./docs/RELEASE.md)
- [Security](./docs/SECURITY.md)
- [AGENTS rules](./AGENTS.md)

## License

Apache-2.0.

The open source edition covers this repository's source code. Appaloft Cloud and other hosted
service-specific code may be distributed separately under different terms.

The Appaloft name, logo, and related brand assets are not granted by the Apache-2.0 license; see
[TRADEMARKS.md](./TRADEMARKS.md).
