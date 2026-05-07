---
title: "Install and serve Appaloft"
description: "Install Appaloft and understand serve paths for the Web console and docs."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "install"
  - "serve"
  - "binary"
relatedOperations: []
sidebar:
  label: "Install and serve"
  order: 1
---

<h2 id="self-hosting-serve-paths">Serve paths</h2>

`appaloft serve` serves the Web console at the root path and public docs under `/docs/*`.

<h2 id="self-hosting-install-binary">Install binary</h2>

The binary includes runtime entrypoints, Web console static assets, and public docs static assets.

<h2 id="self-hosting-install-docker">Install with Docker</h2>

The release `install.sh` script installs Appaloft as a Docker Compose stack and serves the console
and docs from the same Appaloft server:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

By default, the Docker installer uses PostgreSQL for production self-hosting. For a portable
single-server console that keeps embedded PGlite state, pass `--database pglite`:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --database pglite
```

PGlite mode stores Appaloft state in a durable Docker volume mounted at `/appaloft-data`. Do not put
database passwords, GitHub tokens, SSH keys, or deployment identity values in repository config; keep
those values in the host, CI secret store, or the Appaloft server after it is installed.
