---
title: "Deployment lifecycle"
description: "Understand a deployment from detect and plan through execute, verify, and rollback."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "lifecycle"
  - "detect"
  - "plan"
  - "verify"
  - "rollback"
relatedOperations:
  - deployments.create
  - deployments.plan
  - deployments.show
sidebar:
  label: "Lifecycle"
  order: 3
---

<h2 id="deployment-lifecycle">Deployment lifecycle</h2>

Appaloft models deployment as `detect -> plan -> execute -> verify -> rollback`.

This lifecycle explains user-visible deployment state. Users need to know which step failed, which input it used, and how to recover.

![Deployment lifecycle](/docs/diagrams/deployment-lifecycle.svg)

<h3 id="deployment-detect">Detect</h3>

Detect reads source and configuration evidence to identify application type, build behavior, runtime entrypoint, and network exposure.

Common failures:

- Source cannot be read.
- Repository ref or base directory does not exist.
- App type cannot be detected and no runtime profile was supplied.

<h3 id="deployment-plan">Plan</h3>

Plan turns source, runtime, health, and network configuration into an executable plan that explains what Appaloft will run.

The plan should summarize build, start, health check, and access routing decisions.

<h3 id="deployment-plan-preview">Deployment plan preview</h3>

Plan preview runs only `detect -> plan`. It does not create a deployment attempt, write deployment events, or run build, run, verify, or proxy changes.

The preview shows detected framework/runtime evidence, selected planner, support tier, artifact kind, install/build/start/package commands, internal port, health check, access route summary, warnings, and unsupported reasons. Blocked previews include the phase, reason code, safe evidence, fix path, override path, and affected resource profile field when Appaloft can identify one. Fix resource source/runtime/network/health/access profiles first, then run the deployment.

Explicit planner/profile choices win over inference. Custom install/build/start commands, Dockerfile, Compose, prebuilt image, source base directory, internal port, and explicit health policy can repair unsupported, ambiguous, or missing evidence before you run `deployments.create`. Static deployments use the Appaloft static server on internal port `80`; server-rendered or HTTP services need an internal port in the resource network profile.

<h3 id="deployment-execute">Execute</h3>

Execute builds, uploads, starts, and routes the application in the selected target environment.

Execution failures often involve network, credentials, image pulls, build commands, server resources, or runtime backend behavior. Inspect logs and diagnostics before changing domains.

<h3 id="deployment-verify">Verify</h3>

Verify checks process state, health policy, proxy routing, and access URLs.

Verify failure does not always mean the process failed to start. It may be health path, listener port, proxy routing, or access URL observation.

<h3 id="deployment-rollback">Rollback</h3>

Rollback is the recovery path after failure. It should not hide failure as success.

<h2 id="deployment-status-reading">How to read status</h2>

Start from the latest failed phase:

- detect failed: fix source or configuration.
- plan failed: fix resource profiles.
- execute failed: inspect server, credentials, build, and runtime logs.
- verify failed: inspect health, network, proxy, and access route.
- rollback failed: manual intervention is required; save diagnostics first.

Related pages: [Deployment sources](/docs/en/deploy/sources/), [Logs and health](/docs/en/observe/logs-health/), and [Safe recovery](/docs/en/observe/recovery/).

Deployment status response example:

```json title="GET /api/deployments/dep_123"
{
  "id": "dep_123",
  "resourceId": "res_web",
  "status": "verifying",
  "currentPhase": "verify",
  "sourceSummary": {
    "kind": "git-repository",
    "gitRef": "main",
    "baseDirectory": "."
  },
  "recoveryHint": "Inspect health summary before retrying."
}
```
