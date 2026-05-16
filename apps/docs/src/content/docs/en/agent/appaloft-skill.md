---
title: "Appaloft skill"
description: "Let AI agents use the full Appaloft platform like a CLI, HTTP API, or Web entrypoint."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "appaloft skill"
  - "AI entrypoint"
  - "full skill"
relatedOperations:
  - deployments.create
  - resources.create
  - servers.register
  - domain-bindings.create
  - dependency-resources.provision-postgres
sidebar:
  label: "Appaloft skill"
  order: 0
---

<h2 id="appaloft-skill">Appaloft AI entrypoint</h2>

The Appaloft Skill is the full product entrypoint for AI agents. It maps to the same Appaloft
operation catalog as the CLI, HTTP API, Web console, and future MCP tools; the difference is that
its target user is an AI agent.

It is not a new business operation and not an `appaloft deploy` wrapper. It translates user intent
into existing Appaloft operations and chooses CLI, HTTP/API, Web, or future MCP based on the active
agent environment.

<h2 id="appaloft-skill-install">Install</h2>

Install the full Appaloft skill:

```bash
npx skills add appaloft
```

Direct package fallback:

```bash
npx @appaloft/skills install appaloft
```

The installer only copies skill files. It does not deploy an app, create resources, call APIs, or
wrap the CLI. Hosts that only need the deploy subprotocol can still install:

```bash
npx @appaloft/skills install deploy
```

<h2 id="appaloft-skill-scope">Scope</h2>

The full skill covers every entrypoint in the Appaloft CLI operation catalog, including:

- project, server, environment, and resource lifecycle;
- source/runtime/network/health/access/variable/resource profile configuration;
- deploy, preview cleanup, plan, logs, events, retry, redeploy, and rollback;
- domain binding, certificate, and default access;
- dependency resources, backup/restore, and resource dependency binding;
- storage volumes, scheduled tasks, runtime control, and terminal sessions;
- runtime usage, runtime monitoring, operator work, audit events, and retention;
- organization, auth bootstrap, deploy tokens, providers, plugins, upgrade, and database
  maintenance.

The complete CLI map ships with the package at `skills/appaloft/references/cli-entrypoints.md`.

<h2 id="appaloft-skill-safety">Safety boundary</h2>

- Do not read `.env`, private keys, token files, cloud credentials, deploy tokens, SSH material,
  cookies, or unmasked secrets.
- Do not bypass Appaloft by mutating Docker, SSH, databases, proxies, or provider SDKs directly.
- Do not invent agent-only operations; every action maps to an existing CLI/API/Web/MCP operation.
- Do not assume hosted artifact storage. By default, deployment still targets the user's selected
  BYOS destination.

<h2 id="appaloft-skill-reference">Source document</h2>

The complete governing source lives in `docs/agent/appaloft-skill.md`. The installable skill is
packaged in `@appaloft/skills` under `skills/appaloft`.
