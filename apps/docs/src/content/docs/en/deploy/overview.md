---
title: "Deploy an app"
description: "Understand Appaloft's deployment lifecycle: detect, plan, execute, verify, rollback."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "deploy"
  - "deployment"
  - "rollback"
  - "verify"
relatedOperations:
  - deployments.create
  - deployments.cleanup-preview
  - source-links.relink
sidebar:
  label: "Deploy an app"
  order: 3
---

![Appaloft docs surface](/docs/diagrams/docs-surface.svg)

<h2 id="deployment-source">Choose a deployment source</h2>

A deployment source can be a local folder, Git repository, Docker image, Compose manifest, or static site. This choice controls what Appaloft reads during detect and what runtime strategy the plan can produce.

Web, CLI, and HTTP API surfaces should explain source input with the same vocabulary: it describes what to deploy, not a replacement for project, server, environment, or domain configuration.

Minimal CLI example:

```bash title="Deploy the current directory"
appaloft deploy . \
  --project prj_example \
  --environment env_production \
  --server srv_primary \
  --method static \
  --publish-dir dist \
  --port 3000
```

HTTP API example:

```http title="Create deployment"
POST /api/deployments
Content-Type: application/json

{
  "projectId": "prj_example",
  "environmentId": "env_production",
  "serverId": "srv_primary",
  "resourceId": "res_web",
  "source": {
    "kind": "git-repository",
    "locator": "https://github.com/example/web",
    "gitRef": "main",
    "baseDirectory": "."
  }
}
```

<h2 id="deployment-source-relink">Relink a deployment source</h2>

Source relink is an explicit recovery action when the source attached to a resource or deployment history is no longer reachable, or when the user needs to move the same resource to a new repository, path, or image. It changes what later detect and plan stages read, so it should not be treated as an ordinary retry.

Before relinking, confirm the target resource, current source, new source, and expected environment. After relinking, use the next deployment or resource detail view to confirm Appaloft reads from the new source.

<h2 id="deployment-lifecycle">Deployment lifecycle</h2>

Appaloft models deployment as `detect -> plan -> execute -> verify -> rollback`.

![Deployment lifecycle](/docs/diagrams/deployment-lifecycle.svg)

<h3 id="deployment-detect">Detect</h3>

Detect reads source and configuration evidence to identify the app type, build flow, runtime entrypoint, and network needs.

<h3 id="deployment-plan">Plan</h3>

Plan turns resource source, runtime, health, and network settings into an executable plan.

<h3 id="deployment-execute">Execute</h3>

Execute builds, uploads, starts, and routes the app in the selected target environment.

<h3 id="deployment-verify">Verify</h3>

Verify checks process state, health policy, proxy route, and reachable access URLs.

<h3 id="deployment-rollback">Rollback</h3>

Rollback is the recovery path. Failure pages should explain what can be retried and what requires a manual fix.

<h2 id="deployment-preview-cleanup">Clean up preview deployments</h2>

Preview cleanup removes deployments created for a pull request, branch, or temporary source. It is an explicit lifecycle operation: the cleanup target must be identified by preview type and preview id, and must not delete production environments or ordinary deployment history by accident.

After cleanup, check resources, deployment lists, access routes, and runtime logs to confirm the preview instance stopped and its generated access URL is no longer shown as an active entrypoint.
