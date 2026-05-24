# Appaloft Deploy Skill

> GOVERNING DOCUMENT
>
> This is the canonical v1 agent-facing deploy subprotocol. It teaches an AI agent how to
> deploy through Appaloft without bypassing Appaloft operations, leaking secrets, or
> inventing unsupported MCP/tool behavior before the product exposes it.

## Purpose

The full [Appaloft Skill](./appaloft-skill.md) is the AI-facing product entrypoint. This deploy
subprotocol turns a user request such as "deploy this app", "deploy this API", "deploy this Compose
stack", "deploy this image", or "publish this static output" into the same Appaloft flow a human
would use. Static output is one low-friction entrypoint, not the scope of the skill. The canonical
source lives in this document and the installable full skill references it from
`skills/appaloft/references/deploy-protocol.md`.

1. Inspect the source safely.
2. Choose the smallest supported entrypoint and state owner.
3. Dispatch existing CLI, HTTP/API, or Web operations through the active Appaloft surface.
4. Report the deployment outcome by URL, status, logs, diagnostics, and recovery commands.

The skill is more important than MCP for v1 because it can guide any capable coding agent today.
MCP descriptors should later expose the same operation keys and documentation anchors, not replace
this protocol.

## Install

Install the full Appaloft skill for Codex-compatible skill hosts:

```bash
npx skills add appaloft/appaloft
```

The install command only copies the full Appaloft skill into a skill host. It does not deploy an
app, create resources, call Appaloft deployment APIs, or wrap `appaloft deploy`. Deployment starts
later, when the installed skill is loaded by an agent and the user asks that agent to deploy
something. The deploy protocol is part of the full Appaloft skill, not a separate npm installer.

## Guardrails

- Do not read, print, or copy secret values. Use existing secret references, environment variable
  names, or masked diagnostics only.
- Do not call provider SDKs or mutate Docker, SSH, or database state directly when an Appaloft
  command/API operation exists.
- Do not create a separate `quick-deploy.create` operation. Quick Deploy remains a workflow over
  `projects.create`, `servers.register`, `environments.create`, `resources.create`, optional
  resource configuration, and `deployments.create`.
- Do not add source, runtime, or network fields to `deployments.create`. Those belong to the
  Resource profile and deployment snapshot.
- Do not add dependency, dependency backup policy, storage, scheduled task, auto-deploy, generated
  access, or monitoring threshold fields to `deployments.create`. `appaloft.yaml` declarations for
  dependencies, dependency backup policy, storage, scheduled tasks, auto-deploy policy, generated
  access profile, or runtime monitoring thresholds must reconcile through existing dependency,
  backup-policy, storage, Resource binding, scheduled task, Resource auto-deploy, Resource access,
  and runtime monitoring threshold operations before deployment admission.
- Prefer the user's BYOS target. Appaloft should not silently upload artifacts to a hosted cloud
  service unless the user explicitly selects a hosted feature that documents that behavior.
- Do not ask ordinary users for project/resource/server ids as the first step of a GitHub Action
  deploy. Prefer source-link state, repository binding, deploy-token scope, or one-time trusted
  bootstrap context.
- For local static output, use `appaloft deploy ./dist --as static-site` or the equivalent Web/API
  workflow. This is only one Appaloft deploy mode; Dockerfile, Compose, prebuilt image, and
  workspace-command deployments still use the same resource and deployment operation boundary.

## Source Inspection

Inspect only metadata needed to choose a deployment path:

- package manager and scripts;
- framework evidence;
- Dockerfile or Compose files;
- prebuilt image references;
- runtime ports and start commands;
- static output directories such as `dist`, `build`, or `public`;
- Appaloft config files;
- existing public docs or README deployment hints.

Never open `.env`, private key files, token files, or provider credential files. If credentials are
needed, ask the user to register or reference them through Appaloft.

## Entrypoint Selection

Use this order:

In a shell-capable agent session, the following are the CLI forms. In Web or HTTP/API contexts, use
the equivalent Resource and Deployment operation flow instead of shelling out.

1. If the repository has an Appaloft deployment config, run `appaloft deploy <source>`.
2. If the user names a prebuilt image, run `appaloft deploy image://<image>:<tag> --method prebuilt-image`.
3. If Docker Compose is the clearest source of truth, run `appaloft deploy <source> --method docker-compose`.
4. If a Dockerfile is the clearest source of truth, run `appaloft deploy <source> --method dockerfile`.
5. If the user points at an already built static directory, run `appaloft deploy <dir> --as static-site`.
6. If the repository is a static site source, run `appaloft deploy <source> --method static --publish-dir <dir>`.
7. Otherwise use workspace commands with explicit install, build, start, and port options.

When Web is the active surface, choose the equivalent Quick Deploy source card and keep advanced
runtime fields hidden until the source evidence requires them.

## GitHub Action Deployment Modes

Choose the Action mode before asking for Appaloft ids:

- Pure SSH Action is the default BYOS path. The Action installs/runs the CLI, deploys over SSH, uses
  `control-plane-mode: none`, and stores SSH-target state in server-owned `ssh-pglite`. It does not
  need an Appaloft console, deploy token, project id, resource id, or server id.
- Self-hosted Server Action is for an existing Appaloft console/API. The Action does not SSH or run
  the CLI; it calls the selected control-plane API. Require `control-plane-url` and
  `appaloft-token`, and prefer `server-config-deploy: true` so the server reads `appaloft.yml`,
  applies profile/env/domain intent, resolves source links, and dispatches ids-only
  `deployments.create`.
- Product-grade Preview is a control-plane workflow. Use it when Appaloft Cloud or a self-hosted
  control plane should own preview policy, GitHub App webhooks, comments/checks, cleanup retry,
  scheduler, audit, and quota. Do not describe it as the same thing as a user-maintained
  Action-only PR preview workflow.

If a self-hosted server cannot resolve source-link or repository binding context, ask the user to
establish the binding or run one trusted bootstrap with complete project/environment/resource/server
context. Treat ids as bootstrap/advanced override/debug inputs, not the normal user mental model.

## Outcome Packet

At the end, report a compact outcome:

- access URL or why it is not available yet;
- deployment id;
- resource id;
- lifecycle status;
- `appaloft logs <deploymentId>`;
- `appaloft resource diagnose <resourceId>`;
- `appaloft deployments recovery-readiness <deploymentId>`.

If the deployment fails, do not guess. Read structured status, logs, diagnostics, and recovery
readiness, then give the next safe action.

## Public Help Anchors

- First deployment: `/docs/start/first-deployment/#agent-deploy-skill`
- Sources: `/docs/deploy/sources/#local-static-output`
- Errors and statuses: `/docs/reference/errors-statuses/#agent-readable-errors`
- Logs and health: `/docs/observe/logs-health/#agent-deploy-follow-up`
- Recovery: `/docs/deploy/recovery/#agent-deploy-recovery`
