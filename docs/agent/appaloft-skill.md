# Appaloft Skill

> GOVERNING DOCUMENT
>
> This is the canonical full Appaloft AI-facing skill. It makes Appaloft available to agents as a
> first-class content entrypoint alongside CLI, HTTP/API, Web, and MCP surfaces.

## Purpose

The Appaloft skill turns user intent such as "deploy this app", "configure this resource", "check
why access is failing", "rotate this deploy token", "restore this database", or "prune old logs"
into the same Appaloft operation catalog used by the CLI, HTTP/API, Web console, and MCP
tools.

The skill is not only a static-site or deploy shortcut. Deploy is a high-frequency workflow inside
the full skill. The top-level skill must cover every CLI operation entrypoint and keep operation
semantics aligned with `docs/CORE_OPERATIONS.md` and `packages/application/src/operation-catalog.ts`.

## Install

Install the full AI-facing Appaloft entrypoint:

```bash
npx skills add appaloft/appaloft
```

This only copies skill files into the target skill host. It does not deploy, create resources, call
Appaloft APIs, or wrap the Appaloft CLI.
Appaloft does not provide a separate npm skill installer; `npx skills add appaloft/appaloft` is the
single skill-manager entrypoint.

## Entry Surface

Treat the skill as an AI-oriented peer to these Appaloft surfaces:

- CLI: local shell-capable agent sessions;
- HTTP/API: agents running beside or integrating with a control plane;
- Web: human-guided console workflows;
- MCP/tools: callable descriptors over the same operation catalog when `appaloft mcp stdio` is
  configured;
- repository config: source-controlled deployment intent.

The skill chooses among those surfaces based on the current agent environment. It must not invent
agent-only operations. In shell-capable sessions that need hosted product context, the skill should
check `appaloft auth status` or `appaloft context show` first, then run `appaloft login` when no
active profile exists. Without `--url`, login defaults to `https://app.appaloft.com`; credential
material stays in local CLI environment/profile handling, not in chat.

For GitHub Actions, the skill must keep three deployment shapes distinct:

- Pure SSH Action: fastest BYOS deploy, `control-plane-mode: none`, CLI runs in the Action, SSH
  target owns `ssh-pglite` state, and source-link context is reused without asking for console ids.
- Self-hosted Server Action: existing self-hosted Appaloft console/API owns state; the Action calls
  `control-plane-url` with `appaloft-token`, does not SSH or run the CLI, and should prefer
  `server-config-deploy: true`.
- Product-grade Preview: Appaloft Cloud or self-hosted control plane owns preview policy, GitHub
  App webhook intake, comments/checks, cleanup retry, scheduler, audit, and quota. This is separate
  from Action-only PR preview workflow files.

## Coverage Contract

The installable `appaloft` skill must include:

- every CLI transport command from the application operation catalog;
- operation keys beside CLI forms so an agent can map CLI/API/Web/MCP surfaces back to the same
  business operation;
- safety rules for secrets, credentials, local files, logs, and diagnostics;
- local CLI profile/context guidance for default Appaloft Cloud login and remote control-plane use;
- deploy, observe, recover, configure, administer, and maintenance workflows;
- a deploy subprotocol equivalent to `appaloft-deploy` for first-deploy and URL-first outcomes.

## Safety Rules

- Do not read `.env`, private keys, token files, cloud credential files, deploy tokens, SSH
  material, cookies, or unmasked secrets.
- Do not ask users to paste product-session cookies, bearer tokens, deploy tokens, browser cookies,
  or raw secret material into chat for CLI login.
- Do not call provider SDKs or mutate Docker, SSH, database, proxy, or cloud state directly when an
  Appaloft operation exists.
- Do not add source/runtime/network fields to `deployments.create`; configure Resource profile
  operations and let deployment snapshots capture them.
- Do not introduce `quick-deploy.create`, agent-only mutations, or hidden MCP-only behavior.
- Do not assume hosted artifact storage or hosted routing. Default to the user's selected BYOS
  target unless the user explicitly selects a documented hosted feature.

## Packaged Artifact

- Full skill source: `skills/appaloft`.
- Best-practice eval suite: `skills/appaloft/evals/evals.json`.
- Entrypoint surfaces: `skills/appaloft/references/surfaces.md`.
- Complete CLI operation reference: `skills/appaloft/references/cli-entrypoints.md`.
- Deploy subprotocol: `skills/appaloft/references/deploy-protocol.md`.
- MCP tool guide: `skills/appaloft/references/mcp-tools.md`.

## Skill Evaluation Loop

The skill follows the Agent Skills progressive-disclosure model: `SKILL.md` stays short, and
detailed operation maps, deploy protocol, and MCP guidance live in one-level references. Its
quality gate is the eval suite in `skills/appaloft/evals/evals.json`, which is grounded in public
Appaloft docs, workflows, testing matrices, and `packages/application/src/operation-catalog.ts`.

The eval suite must cover real Appaloft tasks, including project lifecycle, saving/registering and
managing servers, server readiness/capacity/proxy maintenance, SSH credentials, environments,
Resource profile configuration, Resource secrets/effective config, first deploy, deployment
observation and recovery, domains/TLS, generated default access and route diagnostics, dependency
resources and backups, storage, scheduled tasks, runtime usage and monitoring, runtime controls,
terminal sessions, source links, preview cleanup, source-event auto-deploy diagnostics, static
artifact publishing, audit/retention/operator work, organization/auth/deploy tokens, system
capabilities/maintenance, default Cloud CLI context bootstrap, MCP usage, and secret/bypass refusal.
When a new public operation family becomes a core user workflow, add or update an eval instead of
expanding `SKILL.md` with exhaustive prose.

Run the local validator before changing the skill:

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

Use `--dry-run` to verify prompt construction without calling a model.

## MCP Boundary

The skill stays lightweight on purpose. It should not enumerate every Appaloft command inline;
operation coverage belongs in references, public docs, and the MCP operation catalog resource.

When MCP is available, the skill may prefer MCP tool calls for exact input/output. The tools still
dispatch through `CommandBus` and `QueryBus` with `entrypoint: "mcp"`. The skill remains the
workflow layer that decides what to inspect, what operation to call next, how to avoid secrets, and
how to report the outcome.
