---
title: "Variable precedence and snapshots"
description: "Understand variable precedence, build-time variables, runtime variables, and deployment snapshots."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "env"
  - "variables"
  - "snapshot"
  - "precedence"
relatedOperations:
  - environments.set-variable
  - environments.unset-variable
sidebar:
  label: "Precedence and snapshots"
  order: 3
---

<h2 id="environment-variable-precedence">Variable precedence</h2>

Appaloft resolves configuration as defaults, system, organization, project, environment, and deployment snapshot. Users mainly need to know that deployments use snapshot values.

User-visible rules:

- Configuration closer to the deployment wins.
- Environment variables override project or system defaults.
- Creating a deployment stores an immutable snapshot.
- Changing variables later does not change that deployment.

This lets users update staging or production configuration without silently rewriting deployment history.

<h2 id="environment-variable-build-vs-runtime">Build-time and runtime variables</h2>

Build-time variables can enter artifacts and cannot be secret. Runtime variables are used when the application starts and runs.

| Type | Used when | Can be secret |
| --- | --- | --- |
| Build-time variable | Build phase, frontend bundle, static artifact generation. | No. It may enter artifacts. |
| Runtime variable | Application startup and runtime. | Yes. Read models and logs must mask values. |

If a variable is visible to the browser, such as `PUBLIC_` or `VITE_`, do not treat it as a secret.

<h2 id="environment-snapshot">Deployment snapshot</h2>

Every deployment stores an immutable environment snapshot. Later variable changes do not change running or completed deployments.

Deployment details should show the configuration summary used by that deployment, not only the current environment variable table.

<h2 id="environment-variable-surfaces">Entrypoints</h2>

The Web console should show variables, masked secret status, last update time, and deployment snapshot hints.

The CLI fits `set`, `unset`, `diff`, and automation scripts. CLI output should show masked status for secrets, not values.

The HTTP API should return variable key, scope, whether it is secret, source layer, and masked value. It should not return plaintext secrets.

<h2 id="environment-variable-recovery">Common issues</h2>

If a deployment did not read a new variable:

1. Confirm the variable was set in the correct environment.
2. Confirm whether the variable is needed at build time or runtime.
3. For runtime variables, redeploy so the app reads a new snapshot.
4. For build-time variables, rebuild and redeploy.

Related pages: [Secrets](/docs/en/environments/variables/secrets/) and [Diff and promote environments](/docs/en/environments/changes/diff-promote/).
