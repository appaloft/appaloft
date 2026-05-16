# Appaloft Skill

> GOVERNING DOCUMENT
>
> This is the canonical full Appaloft AI-facing skill. It makes Appaloft available to agents as a
> first-class content entrypoint alongside CLI, HTTP/API, Web, and future MCP surfaces.

## Purpose

The Appaloft skill turns user intent such as "deploy this app", "configure this resource", "check
why access is failing", "rotate this deploy token", "restore this database", or "prune old logs"
into the same Appaloft operation catalog used by the CLI, HTTP/API, Web console, and future MCP
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
- MCP/tools: later generated tool descriptors over the same operation catalog;
- repository config: source-controlled deployment intent.

The skill chooses among those surfaces based on the current agent environment. It must not invent
agent-only operations.

## Coverage Contract

The installable `appaloft` skill must include:

- every CLI transport command from the application operation catalog;
- operation keys beside CLI forms so an agent can map CLI/API/Web/MCP surfaces back to the same
  business operation;
- safety rules for secrets, credentials, local files, logs, and diagnostics;
- deploy, observe, recover, configure, administer, and maintenance workflows;
- a deploy subprotocol equivalent to `appaloft-deploy` for first-deploy and URL-first outcomes.

## Safety Rules

- Do not read `.env`, private keys, token files, cloud credential files, deploy tokens, SSH
  material, cookies, or unmasked secrets.
- Do not call provider SDKs or mutate Docker, SSH, database, proxy, or cloud state directly when an
  Appaloft operation exists.
- Do not add source/runtime/network fields to `deployments.create`; configure Resource profile
  operations and let deployment snapshots capture them.
- Do not introduce `quick-deploy.create`, agent-only mutations, or hidden MCP-only behavior.
- Do not assume hosted artifact storage or hosted routing. Default to the user's selected BYOS
  target unless the user explicitly selects a documented hosted feature.

## Packaged Artifact

- Full skill source: `skills/appaloft`.
- Entrypoint surfaces: `skills/appaloft/references/surfaces.md`.
- Complete CLI operation reference: `skills/appaloft/references/cli-entrypoints.md`.
- Deploy subprotocol: `skills/appaloft/references/deploy-protocol.md`.
