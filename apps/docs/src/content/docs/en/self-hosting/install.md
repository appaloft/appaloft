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

Docker installs apply pending database migrations before the Appaloft HTTP service starts. If a
migration fails, the container will not pass health checks, and the installer will report the
failure with the container logs. After fixing the database or image issue, rerun the same install
command.

For advanced or offline installs, pass `--image` to use a preloaded Appaloft image. Add
`--skip-image-pull` only when the image already exists in the local Docker daemon and should not be
pulled from a registry.

PGlite mode stores Appaloft state in a durable Docker volume mounted at `/appaloft-data`. Do not put
database passwords, GitHub tokens, SSH keys, or deployment identity values in repository config; keep
those values in the host, CI secret store, or the Appaloft server after it is installed.

The installer also generates and reuses a stable secret for product login sessions. It is stored in
the install directory's `.env` file and injected into the Appaloft container. Keep that value when
upgrading or repairing the install, otherwise existing login sessions will be invalidated.

The default install also starts an Appaloft-managed Traefik edge proxy. Without a domain, the
console is reachable on the server's `3721` port. To bind the console to a domain, point DNS at the
server, open `80` and `443`, and pass `--domain`:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --domain console.example.com
```

This domain is the Appaloft instance's own console bootstrap route. It is not a project resource
custom domain, deployment snapshot, or DomainBinding. To change the console domain later, rerun the
installer with the new `--domain`. Use `--proxy none` only when an external reverse proxy already
owns public routing.

For install-time tracing, pass `--trace jaeger`. The installer starts a Jaeger all-in-one container,
sets Appaloft's OTLP endpoint to the internal collector at `http://jaeger:4318`, and writes trace
links back to the Jaeger UI. The UI binds to `127.0.0.1:16686` by default; use an SSH tunnel or
override `--jaeger-ui-host` and `--jaeger-ui-port` when an operator network should reach it
directly.

After the first install, create a local admin and log in to the console. See
[First admin bootstrap](/docs/en/self-hosting/first-admin-bootstrap/) for admin email, generated
one-time passwords, optional OAuth, and recovery steps.

When the host is already a Docker Swarm manager, install the console as a Swarm stack:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- --database pglite --orchestrator swarm --stack-name appaloft
```

Add `--swarm-init` only when the installer should initialize a single-node Swarm manager.
