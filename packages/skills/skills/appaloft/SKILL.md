---
name: appaloft
description: Use Appaloft as a complete AI-facing deployment platform entrypoint. Trigger when an AI agent is asked to deploy, inspect, configure, operate, observe, recover, administer, or document Appaloft projects, servers, environments, resources, deployments, domains, certificates, dependencies, storage, scheduled tasks, runtime monitoring, audit events, organizations, deploy tokens, or system maintenance through the same operation catalog exposed by CLI, HTTP/API, Web, and future MCP surfaces.
---

# Appaloft

This skill is the AI-facing Appaloft entrypoint. It is peer to the CLI, HTTP/API, Web console, and
future MCP tools, but its target user is an AI agent. It does not create agent-only business
operations. It maps user intent to the same Appaloft operation catalog and chooses the active
surface available in the session.

## Operating Model

1. Classify the user's intent into an Appaloft operation area: deploy, project/server/environment,
   resource profile, runtime control, domain/TLS, dependency resource, storage, scheduled task,
   observation, recovery, audit/retention, organization/auth, or system maintenance.
2. Choose the active surface: CLI for local shell-capable agents, HTTP/API for control-plane
   integrations, Web when guiding a human through the console, and MCP only when available.
3. Use existing Appaloft operations only. Do not invent hidden agent commands, bypass adapters, call
   provider SDKs directly, mutate Docker/SSH/database state directly, or inspect repositories/use
   cases/persistence internals for product behavior.
4. Preserve safety boundaries: never read or print `.env`, private keys, token files, cloud
   credentials, deploy tokens, SSH material, cookies, or unmasked secrets.
5. Return outcome-first results: URL or access state first when relevant, then ids, status,
   commands/API paths used, logs, diagnostics, recovery readiness, and the next safe action.

## References

- Read [references/cli-entrypoints.md](references/cli-entrypoints.md) when the task needs exact CLI
  forms or operation keys. It mirrors every CLI transport in the Appaloft operation catalog.
- Read [references/deploy-protocol.md](references/deploy-protocol.md) for deploy, preview cleanup,
  plan, observe, retry, redeploy, and rollback tasks.

## Common Workflows

- First deployment: inspect source safely, create or select project/server/environment/resource,
  plan when useful, deploy, observe, and return URL plus diagnostics.
- Operate an existing resource: use resource profile commands for source/runtime/network/health/
  access/variables/dependencies/storage, then redeploy or restart only when needed.
- Recover a failed deployment: read deployment detail, logs, resource diagnostics, and recovery
  readiness before retry/redeploy/rollback.
- Add access: use default access policy, domain binding, certificate, and route configuration
  operations rather than editing proxy/provider state by hand.
- Manage backing services: use dependency-resource provision/import/backup/restore and resource
  dependency binding operations; do not inject raw connection strings into chat output.
- Observe and administer: use runtime usage, monitoring, operator work, audit events, retention,
  deploy tokens, organization, auth bootstrap, provider/plugin, upgrade, and database commands.

## Installation Boundary

`npx @appaloft/skills add appaloft` installs this skill into a skill host. It only copies skill
files. It does not deploy, create resources, call APIs, or wrap the Appaloft CLI.
