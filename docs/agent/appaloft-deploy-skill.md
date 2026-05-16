# Appaloft Deploy Skill

> GOVERNING DOCUMENT
>
> This is the canonical v1 agent-facing deploy skill. It teaches an AI agent how to
> deploy through Appaloft without bypassing Appaloft operations, leaking secrets, or
> inventing unsupported MCP/tool behavior before the product exposes it.

## Purpose

The skill turns a user request such as "deploy this app" or "publish this static output" into the
same Appaloft flow a human would use. The canonical source lives in this document and the packaged
installable skill lives at `packages/agent-skill/skills/appaloft-deploy`.

1. Inspect the source safely.
2. Choose the smallest supported entrypoint.
3. Dispatch existing CLI or HTTP/API operations.
4. Report the deployment outcome by URL, status, logs, diagnostics, and recovery commands.

The skill is more important than MCP for v1 because it can guide any capable coding agent today.
MCP descriptors should later expose the same operation keys and documentation anchors, not replace
this protocol.

## Install

Install the skill for Codex-compatible skill hosts:

```bash
npx @appaloft/agent-skill install deploy
```

By default this installs to `${CODEX_HOME:-~/.codex}/skills/appaloft-deploy`. For repository-local
or custom skill hosts, install into a directory:

```bash
npx @appaloft/agent-skill install deploy --target directory --path ./.agents/skills
```

Use `--force` to replace an existing installed copy and `--dry-run` to preview the destination.

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
- Prefer the user's BYOS target. Appaloft should not silently upload artifacts to a hosted cloud
  service unless the user explicitly selects a hosted feature that documents that behavior.
- For local static output, use `appaloft deploy ./dist --as static-site` or the equivalent Web/API
  workflow. The static directory is the source; Appaloft still deploys it through the normal
  resource and deployment operations.

## Source Inspection

Inspect only metadata needed to choose a deployment path:

- package manager and scripts;
- framework evidence;
- Dockerfile or Compose files;
- static output directories such as `dist`, `build`, or `public`;
- Appaloft config files;
- existing public docs or README deployment hints.

Never open `.env`, private key files, token files, or provider credential files. If credentials are
needed, ask the user to register or reference them through Appaloft.

## Entrypoint Selection

Use this order:

1. If the user points at an already built static directory, run `appaloft deploy <dir> --as static-site`.
2. If the repository has an Appaloft deployment config, run `appaloft deploy <source>`.
3. If the repository is a static site source, run `appaloft deploy <source> --method static --publish-dir <dir>`.
4. If Docker Compose is the clearest source of truth, run `appaloft deploy <source> --method docker-compose`.
5. If a Dockerfile is the clearest source of truth, run `appaloft deploy <source> --method dockerfile`.
6. Otherwise use workspace commands with explicit install, build, start, and port options.

When Web is the active surface, choose the equivalent Quick Deploy source card and keep advanced
runtime fields hidden until the source evidence requires them.

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
