---
title: "Secrets"
description: "Handle secrets, log masking, and diagnostics safely."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "secret"
  - "masking"
  - "runtime variable"
relatedOperations:
  - environments.set-variable
  - resources.set-variable
  - resources.import-variables
  - resources.effective-config
sidebar:
  label: "Secrets"
  order: 4
---

<h2 id="environment-secret-values">Secret values</h2>

Secret values are for runtime use and should not appear in read models, logs, diagnostics, support
payloads, or effective-config responses as plaintext.

Users should see the existence and state of a secret, such as masked value, last update time, source environment, and whether it participates in deployment snapshots. They should not see plaintext values.

When pasted `.env` content is imported into a resource, Appaloft treats secret-like keys as runtime
secrets, such as `DATABASE_URL`, `*_TOKEN`, `*_PASSWORD`, and `*_PRIVATE_KEY`. Import summaries,
API, CLI, Web, logs, and diagnostics should show only masked values.

<h2 id="environment-secret-build-time">Build-time limit</h2>

Build-time variables cannot be marked secret because they can become part of build artifacts.

If a variable can enter a browser bundle, static file, or build artifact, it is not a secret. Do not put database passwords, API tokens, or private keys in build-time variables.

Build-time variables must use the `PUBLIC_` or `VITE_` prefix. Build-time variables with
secret-like names are rejected instead of being silently downgraded to plain config.

<h2 id="environment-secret-rotation">Rotate secrets</h2>

After rotating a secret, redeploy resources so running instances read the new deployment snapshot.

Recommended flow:

1. Set the new secret in the target environment or on the target resource when the override is
   resource-specific.
2. Create new deployments for affected resources.
3. Confirm health and logs show the app reading the new value safely.
4. Confirm the old secret is no longer used.
5. Revoke the old secret in the external system.

<h2 id="environment-secret-diagnostics">Diagnostics and support</h2>

When copying diagnostics, copy key names, masked state, error codes, and related deployment ids. Do not copy `.env` files, full variable tables, or secret values.

Related page: [Diagnostics](/docs/en/observe/diagnostics/).
