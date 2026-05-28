---
title: "Appaloft skill"
description: "Let AI agents use the full Appaloft platform like a CLI, HTTP API, Web, or MCP entrypoint."
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
  - dependency-resources.provision
sidebar:
  label: "Appaloft skill"
  order: 0
---

<h2 id="appaloft-skill">Appaloft AI entrypoint</h2>

The Appaloft Skill is the full product entrypoint for AI agents. It maps to the same Appaloft
operation catalog as the CLI, HTTP API, Web console, and MCP tools; the difference is that
its target user is an AI agent.

It is not a new business operation and not an `appaloft deploy` wrapper. It translates user intent
into existing Appaloft operations and chooses CLI, HTTP/API, Web, or MCP based on the active agent
environment. When MCP is configured, the skill can use it as the callable tool layer; without MCP,
the skill still works through CLI, HTTP/API, or Web.

For GitHub Actions, the skill must keep three modes separate: Pure SSH Action is the default BYOS
SSH path and does not require an Appaloft console or ids; Self-hosted Server Action calls an
existing self-hosted console/API through `control-plane-url` and `appaloft-token` without running
the CLI or SSH; Product-grade Preview is owned by Appaloft Cloud or a self-hosted control plane
with preview policy, GitHub App webhooks, comments/checks, cleanup retry, scheduler, audit, and
quota.

<h2 id="appaloft-skill-install">Install</h2>

Install the full Appaloft skill:

```bash
npx skills add appaloft/appaloft
```

The installer only copies skill files. It does not deploy an app, create resources, call APIs, or
wrap the CLI. Appaloft does not provide a separate npm skill installer, which keeps the boundary
clear between skill installation and the `appaloft` CLI.

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

<h2 id="appaloft-skill-evals">Best-practice validation</h2>

The Appaloft skill follows the Agent Skills progressive-disclosure model: keep `SKILL.md` short,
and put long command maps, deploy protocol, and MCP guidance in one-level `references/` files. To
keep the skill from becoming generic deployment advice, the repository also maintains
`skills/appaloft/evals/evals.json`.

The eval suite is derived from public docs, workflows, test matrices, and the operation catalog. It
covers real Appaloft task families: project lifecycle, saving/registering and managing servers, SSH
credentials, server readiness/capacity/proxy maintenance, environments, Resource profile
configuration, Resource secrets/effective config, first deploy, deployment observation and recovery,
domain/TLS, generated default access and route diagnostics, dependency resources, storage,
scheduled tasks, runtime monitoring, runtime controls, terminal sessions, source links, previews,
source-event auto-deploy diagnostics, static artifacts, audit/retention, organization and deploy
tokens, system capabilities/maintenance, MCP, and refusal cases for secrets or bypassing Appaloft.

Before maintaining the skill, run:

```bash
bun run scripts/validate-appaloft-skill-evals.ts
```

For release readiness or a manual nightly check, run the same cases through a real model. This
requires a provider key, so it is not part of the default PR gate:

```bash
bun run scripts/run-appaloft-skill-model-evals.ts --model gpt-5-mini
```

DeepSeek's OpenAI-compatible API can also run the model evals:

```bash
DEEPSEEK_API_KEY=... bun run scripts/run-appaloft-skill-model-evals.ts \
  --provider deepseek \
  --model deepseek-v4-flash
```

GitHub Actions does not run real-model evals on normal pull requests. Configure
`DEEPSEEK_API_KEY` or `OPENAI_API_KEY` as a repository secret, then manually dispatch
`Appaloft Skill Model Evals` for release readiness.

Add `--dry-run` to verify prompt construction without calling a model.

<h2 id="appaloft-skill-mcp">MCP Tools</h2>

MCP is Appaloft's machine-callable tool layer. Run `appaloft mcp stdio` to start the stdio MCP
server. Each tool is generated from an operation key, for example `deployments.create` becomes
`deployments_create`. Tool input schemas come from the same command/query schemas, and calls still
enter the Appaloft command/query buses.

See [Appaloft MCP server](/docs/en/agent/mcp-server/#appaloft-mcp-server) for tool naming,
resources, prompts, and safety boundaries.

<h2 id="appaloft-skill-safety">Safety boundary</h2>

- Do not read `.env`, private keys, token files, cloud credentials, deploy tokens, SSH material,
  cookies, or unmasked secrets.
- Do not bypass Appaloft by mutating Docker, SSH, databases, proxies, or provider SDKs directly.
- Do not invent agent-only operations; every action maps to an existing CLI/API/Web/MCP operation.
- Do not assume hosted artifact storage. By default, deployment still targets the user's selected
  BYOS destination.

<h2 id="appaloft-skill-reference">Source document</h2>

The complete governing source lives in `docs/agent/appaloft-skill.md`. The standard skill source is
`skills/appaloft`; deploy protocol and entrypoint boundaries live under
`skills/appaloft/references/`.
