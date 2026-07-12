---
name: appaloft
description: Use Appaloft as a complete AI-facing deployment platform entrypoint. Trigger when an AI agent is asked to deploy, inspect, configure, operate, observe, recover, administer, or document Appaloft projects, servers, environments, resources, deployments, domains, certificates, dependencies, storage, scheduled tasks, runtime monitoring, audit events, organizations, deploy tokens, MCP tools, or system maintenance through the same operation catalog exposed by CLI, HTTP/API, Web, and MCP surfaces.
---

# Appaloft

This skill is the AI-facing Appaloft entrypoint. It is peer to the CLI, HTTP/API, Web console, and
MCP tools, but its target user is an AI agent. It does not create agent-only business
operations. It maps user intent to the same Appaloft operation catalog and chooses the active
surface available in the session.

## Operating Model

1. Classify the user's intent into an Appaloft operation area: deploy, project/server/environment,
   resource profile, runtime control, domain/TLS, dependency resource, storage, scheduled task,
   observation, recovery, audit/retention, organization/auth, or system maintenance.
2. Choose the active surface and state owner: CLI/pure SSH for local shell-capable agents and
   BYOS Action deploys, HTTP/API for selected control planes, Web when guiding a human through the
   console, and MCP when tools are configured.
   In shell-capable sessions, first run `appaloft auth status` or `appaloft context show` when a
   hosted or self-hosted Appaloft task needs product context. If no active authenticated profile or
   `APPALOFT_TOKEN` is available, do not run a browser login as the agent default. Ask the user to
   grant a scoped, expiring token through a trusted UI, secret manager, environment variable, or
   CLI-approved handoff, then use `APPALOFT_TOKEN` or `appaloft auth token login --stdin` /
   `--token-file <path>` so the CLI verifies and stores the profile without exposing token material
   in chat. `appaloft login` and `appaloft auth login` remain human interactive login commands for
   a user at their own terminal; `--no-browser` only prints a human authorization URL and code, and
   is not an AI-agent auth handoff. This Appaloft identity gate applies to hosted or self-hosted
   API/profile operations; local-only CLI workflows do not require Appaloft login.
   If `appaloft` is not on PATH, do not assume `npx skills add appaloft/appaloft` installed it:
   that command installs only this skill. Install the CLI from the Appaloft GitHub Release archive
   for the current platform, then rerun `appaloft --version`, `appaloft auth status`, and the
   requested operation.
   When validating behavior from an Appaloft source checkout, use that checkout's source CLI
   entrypoint instead of a possibly older globally installed `appaloft` binary. If the exact source
   CLI command fails because the agent sandbox blocks network access, rerun the same source CLI
   command outside the sandbox rather than bypassing Appaloft with direct HTTP, database, SSH,
   Docker, or provider calls.
3. Use existing Appaloft operations only. Do not invent hidden agent commands, bypass adapters, call
   provider SDKs directly, mutate Docker/SSH/database state directly, or inspect repositories/use
   cases/persistence internals for product behavior.
4. Preserve safety boundaries: never read or print `.env`, private keys, token file contents, cloud
   credentials, deploy tokens, SSH material, cookies, or unmasked secrets. A user may point the CLI
   at a token file for `appaloft auth token login`, but the agent must not open or echo it.
5. Return outcome-first results: URL or access state first when relevant, then ids, status,
   commands/API paths used, logs, diagnostics, recovery readiness, and the next safe action.

## References

- Read [references/cli-entrypoints.md](references/cli-entrypoints.md) when the task needs exact CLI
  forms or operation keys. It mirrors every CLI transport in the Appaloft operation catalog.
- Read [references/surfaces.md](references/surfaces.md) when choosing between CLI, HTTP/API, Web,
  repository config, and MCP/tool entrypoints.
- Read [references/deploy-protocol.md](references/deploy-protocol.md) for deploy, preview cleanup,
  GitHub Action mode selection, preview cleanup, plan, observe, retry, redeploy, and rollback tasks.
- Read [references/mcp-tools.md](references/mcp-tools.md) when MCP tools are available or the user
  asks for Appaloft MCP setup, tool names, resources, prompts, or stdio usage.

## Common Workflows

- First deployment: inspect source safely, create or select project/server/environment/resource,
  plan when useful, deploy, watch progress, read `deployments.proof`, and return URL plus
  diagnostics. A terminal deployment status or green CI run is not machine-verifiable success.
  Claim success only when the proof verdict is `verified`; describe `partially-verified`,
  `unverified`, `stale`, or `failed` as the explicit evidence gap or failure they represent.
- Deployment progress observation is a core deploy step. For one deployment attempt, follow
  `appaloft deployments timeline <deploymentId> --follow --json` and use deployment timeline entries for log
  lines. For a parent durable work item that coordinates multiple resources or child deployments,
  follow `appaloft work events <workId> --follow --json` or
  `appaloft work watch <workId> --json`. Remote CLI profiles should use the control-plane stream
  route for follow/watch commands when the route is available; treat `work show` as a snapshot, not
  a live log. If an older CLI/control plane still returns `control_plane_unsupported` for remote
  watch, poll `work show`/`work list` explicitly and report the watch capability gap.
- Blueprint catalog deployment: use `appaloft blueprint list/show/plan-install` for neutral catalog
  discovery and dry-run planning, then use the Blueprint quick-deploy entrypoint when the source is
  an official or extension-provided Blueprint such as PocketBase. Do not invent a separate
  `blueprint deploy` CLI command unless the operation catalog adds one. Before accepting a
  deployment target, inspect the registered server summary/readiness, run
  `appaloft server test <serverId>`, and run `appaloft server proxy repair <serverId>` when the
  target is pending, failed, or unavailable for Appaloft runtime work. A newly registered SSH server
  is not deployable evidence until Appaloft operations prove SSH, Docker runtime, and the configured
  edge proxy are ready. If the control plane reports `Executable not found in $PATH: "ssh"` or
  `Docker is not available on the SSH target`, stop and report the server initialization blocker
  rather than manually SSHing around the Appaloft operation. Treat `blueprints.install` as a command:
  submit it once with required acknowledgement flags
  `accepts-blueprint-application-bundle`, `reviews-dependency-resource-bindings`, and
  `preserves-user-owned-configuration`, then observe any returned parent `workId` through work
  events/watch and any
  returned `deploymentId` through deployment events/logs; do not poll progress by repeatedly
  calling install with the same idempotency key.
- GitHub Action deploy: default to Pure SSH Action when the user supplies an SSH target and no
  control plane; use Self-hosted Server Action only when `control-plane-url` selects an Appaloft
  instance and a deploy token is available; treat product-grade previews as control-plane-owned,
  not as the same thing as a repository-maintained workflow file.
- Operate an existing resource: use resource profile commands for source/runtime/network/health/
  access/variables/dependencies/storage, then redeploy or restart only when needed.
- Recover a failed deployment: read deployment detail, logs, resource diagnostics, and recovery
  readiness before retry/redeploy/rollback.
- Clean up a real deployment smoke: use Appaloft lifecycle commands, not direct database, Docker,
  SSH, or provider mutation. Identify the exact project/resource/deployment/server ids from the
  run output or manifest; stop runtime with `appaloft resource runtime stop <resourceId>` when a
  deployed resource is still running; archive/delete resources with
  `appaloft resource archive <resourceId>` then
  `appaloft resource delete-check <resourceId>` and
  `appaloft resource delete <resourceId> --confirm-slug <slug>` only when the check is eligible;
  archive project-owned deployments with
  `appaloft deployments archive <deploymentId> --confirm <deploymentId>` when they remain visible;
  if project deletion is blocked by `deployment-history`, run scoped dry-run prunes for deployment
  logs, runtime-control attempts, provider job logs, log archives, and archived deployments before
  executing the same prunes for the exact seed-owned resource; run
  `appaloft project delete-check <projectId>`, archive the project, then delete it only when blockers
  are clear. Keep shared or injected test servers for reuse unless the
  user explicitly asks to deactivate/delete the server record. For storage volumes, detach any
  resource attachments through Appaloft first, use
  `appaloft storage volume cleanup-runtime <storageVolumeId> --server <serverId> --before <iso>`
  for runtime realizations, then delete the volume through Appaloft if it is seed-owned. After
  cleanup, use `appaloft server test <serverId>` and `appaloft server capacity inspect <serverId>`
  first when Appaloft owns the SSH credential; if a specific stopped container or runtime artifact
  is suspected, run `appaloft server capacity prune <serverId> --before <iso> --target <id-or-target> --dry-run true`
  before executing the same command with `--dry-run false`. Direct read-only
  SSH/Docker inspection may be used only to verify no orphan containers, networks, or volumes
  remain. If orphans are found, add/fix the corresponding Appaloft cleanup command rather than
  deleting them manually.
- Add access: use default access policy, domain binding, certificate, and route configuration
  operations rather than editing proxy/provider state by hand.
- Manage backing services: use dependency-resource provision/import/inspect/query/backup/restore
  and resource dependency binding operations; do not inject raw connection strings into chat
  output. Dependency query is allowlisted read-only inspection, not a database mutation escape hatch.
- Observe and administer: use runtime usage, monitoring, operator work, audit events, retention,
  deploy tokens, organization, auth bootstrap, provider/plugin, upgrade, and database commands.
- MCP-enabled session: prefer MCP tool calls for precise operation input/output, use MCP resources
  for operation catalog and workflow context, and keep this skill as the procedural protocol that
  decides which tools to call.

## Installation Boundary

`npx skills add appaloft/appaloft` installs this skill into a skill host through the standard skill
manager. It only copies skill files. It does not deploy, create resources, call APIs, or wrap the
Appaloft CLI. Appaloft does not ship a separate npm skill installer; AI-facing behavior enters
through the standard skill manager only.
