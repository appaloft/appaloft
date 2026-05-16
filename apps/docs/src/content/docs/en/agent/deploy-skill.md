---
title: "Agent deploy skill"
description: "How AI agents safely deploy apps and static sites through Appaloft."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "agent deploy"
  - "AI deploy"
  - "skill"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "Agent deploy skill"
  order: 1
---

<h2 id="agent-deploy-skill">Agent deploy protocol</h2>

The Appaloft Deploy Skill is a pre-v1 capability. It is not a new deployment operation and not a
replacement for MCP; it is a user-layer protocol that tells an AI agent how to deploy through the
existing CLI, HTTP API, or Web Quick Deploy surfaces.

The skill keeps the result focused on what the user needs next: access URL, deployment status, logs,
diagnostics, and recovery.

<h2 id="agent-deploy-install">Install the skill</h2>

Codex-compatible skill hosts can install it directly:

```bash
npx @appaloft/agent-skill install deploy
```

By default this installs to `${CODEX_HOME:-~/.codex}/skills/appaloft-deploy`. To install into a
repository-local or other agent skill directory:

```bash
npx @appaloft/agent-skill install deploy --target directory --path ./.agents/skills
```

Pass `--force` to replace an existing installed copy.

<h2 id="agent-deploy-flow">Recommended flow</h2>

1. Inspect the source safely: read only project structure, build scripts, Docker/Compose files,
   static output directories, and Appaloft config.
2. Choose the smallest entrypoint: built static output uses `appaloft deploy ./dist --as static-site`;
   static source uses `--method static --publish-dir <dir>`.
3. Use existing operations: create or choose the project, server, environment, and resource, then
   request `deployments.create`.
4. Return the outcome: access URL first, then deployment id, resource id, logs command, diagnostic
   command, and recovery readiness command.

<h2 id="agent-deploy-safety">Safety boundary</h2>

- Do not read `.env`, private keys, token files, or cloud credential files.
- Do not put secret values in logs, pull requests, diagnostic summaries, or chat replies.
- Do not bypass Appaloft by mutating Docker, SSH, databases, or provider SDKs directly.
- Do not put source, runtime, or network fields into `deployments.create`; they belong to the
  Resource profile and deployment snapshot.
- Do not assume Appaloft uploads artifacts to a hosted cloud. By default, deployment still targets
  the user's selected BYOS destination.

<h2 id="agent-deploy-follow-up">What to return</h2>

Return a compact outcome:

- access URL, or why it is not available yet;
- deployment id and resource id;
- current lifecycle status;
- `appaloft logs <deploymentId>`;
- `appaloft resource diagnose <resourceId>`;
- `appaloft deployments recovery-readiness <deploymentId>`.

If the deployment fails, read structured errors, logs, diagnostics, and recovery readiness before
suggesting the next action.

<h2 id="agent-deploy-reference">Source document</h2>

The complete governing source lives in `docs/agent/appaloft-deploy-skill.md`. The installable skill
is packaged in `@appaloft/agent-skill` under `skills/appaloft-deploy`.
