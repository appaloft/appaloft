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
  - environments.effective-precedence
  - resources.set-variable
  - resources.secrets.create
  - resources.secrets.rotate
  - resources.secrets.delete
  - resources.secrets.list
  - resources.secrets.show
  - resources.import-variables
  - resources.unset-variable
  - resources.effective-config
sidebar:
  label: "Precedence and snapshots"
  order: 3
---

## Variable precedence [#environment-variable-precedence]

Appaloft resolves configuration as defaults, system, organization, project, environment, resource,
and deployment snapshot. Users mainly need to know that deployments use snapshot values.

User-visible rules:

- Configuration closer to the deployment wins.
- Environment variables override project or system defaults.
- Resource variables override environment variables for the same key plus exposure on that
  resource only.
- Creating a deployment stores an immutable snapshot.
- Changing variables later does not change that deployment.

This lets users update staging or production configuration without silently rewriting deployment history.

## Build-time and runtime variables [#environment-variable-build-vs-runtime]

Build-time variables can enter artifacts and cannot be secret. Runtime variables are used when the application starts and runs.

| Type | Used when | Can be secret |
| --- | --- | --- |
| Build-time variable | Build phase, frontend bundle, static artifact generation. | No. It may enter artifacts. |
| Runtime variable | Application startup and runtime. | Yes. Read models and logs must mask values. |

If a variable is visible to the browser, such as `PUBLIC_` or `VITE_`, do not treat it as a secret.

## Deployment snapshot [#environment-snapshot]

Every deployment stores an immutable environment snapshot. That snapshot may include inherited
environment values and resource-specific overrides. Later variable changes do not change running or
completed deployments.

Deployment details should show the configuration summary used by that deployment, not only the current environment variable table.

## Entrypoints [#environment-variable-surfaces]

The Web console should show environment and resource variables, masked secret status, last update
time, ownership scope, and deployment snapshot hints.

The CLI fits `set`, `unset`, `resource secrets ...`, `effective-precedence`, `effective-config`,
`diff`, and automation scripts. CLI output should show masked status for secrets, not values.

The HTTP API should return variable key, scope, whether it is secret, source layer, and masked value. It should not return plaintext secrets.

Use `environments.effective-precedence` to inspect the values one environment contributes before
resource overrides. Use `resources.secrets.create/rotate/delete/list/show` for explicit
resource-level secret reference lifecycle. Use `resources.import-variables` to import pasted `.env` content into one
resource; duplicate keys use the last pasted line and the response reports safe override metadata.
Use `resources.effective-config` to inspect the deployment input view after resource variables
override environment variables, including safe source and override summaries.

## Common issues [#environment-variable-recovery]

If a deployment did not read a new variable:

1. Confirm the variable was set in the correct environment.
2. Confirm whether the variable is needed at build time or runtime.
3. For runtime variables, redeploy so the app reads a new snapshot.
4. For build-time variables, rebuild and redeploy.

Related pages: [Secrets](/docs/en/environments/variables/secrets/) and [Diff and promote environments](/docs/en/environments/changes/diff-promote/).
