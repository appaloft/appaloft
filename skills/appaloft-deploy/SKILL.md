---
name: appaloft-deploy
description: Deploy the full range of Appaloft-supported workloads through Appaloft, including web apps, backend services, workers, Dockerfile apps, Docker Compose stacks, prebuilt images, and built static sites. Use when Codex or another coding agent is asked to deploy with Appaloft, choose between Appaloft CLI/API/Web deploy entrypoints, inspect source safely before deployment, or report deployment URL, logs, diagnostics, and recovery readiness.
---

# Appaloft Deploy

This is the deploy subprotocol of the full `appaloft` skill. Prefer installing the full skill when
the host should operate all Appaloft capabilities; use this narrower skill when the host only needs
deployment guidance.

## Workflow

This skill is loaded by an agent host after installation. The installer only copies the skill into
the host's skill directory; it is not a deployment command and must not be treated as one.

1. Inspect only safe source metadata: package scripts, framework hints, runtime ports,
   Dockerfile/Compose files, prebuilt image references, static output directories, and Appaloft
   config.
2. Choose the smallest supported Appaloft entrypoint.
3. Use existing Appaloft CLI/API/Web operations. Do not bypass Appaloft by mutating Docker, SSH,
   databases, or provider SDKs directly.
4. Return URL/status first, then deployment id, resource id, logs, diagnostics, and recovery
   readiness.

## Entry Selection

When the active surface is a shell, these are the equivalent Appaloft CLI forms. When the active
surface is Web or HTTP/API, use the matching Resource and Deployment operations instead.

- Existing Appaloft config: `appaloft deploy <source>`.
- Docker/OCI image: `appaloft deploy image://<image>:<tag> --method prebuilt-image`.
- Compose: `appaloft deploy <source> --method docker-compose`.
- Dockerfile: `appaloft deploy <source> --method dockerfile`.
- Built static output: `appaloft deploy ./dist --as static-site`.
- Static source: `appaloft deploy <source> --method static --publish-dir <dir>`.
- Otherwise use workspace commands with explicit install, build, start, and port options.

## Guardrails

- Do not open `.env`, private keys, token files, cloud credentials, or provider credential files.
- Do not print or copy secret values.
- Do not invent `quick-deploy.create`.
- Do not add source, runtime, or network fields to `deployments.create`; configure the Resource
  profile and let deployment snapshots capture it.
- Do not assume Appaloft uploads artifacts to hosted cloud storage. Default to the user's selected
  BYOS target.

## Outcome

Report:

- access URL, or why it is not available yet;
- deployment id and resource id;
- lifecycle status;
- `appaloft logs <deploymentId>`;
- `appaloft resource diagnose <resourceId>`;
- `appaloft deployments recovery-readiness <deploymentId>`.

Read [references/protocol.md](references/protocol.md) when the task needs more detail about source
inspection, entrypoint selection, operation boundaries, or failure recovery.
