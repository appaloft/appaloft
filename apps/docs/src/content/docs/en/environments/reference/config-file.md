---
title: "Configuration file"
description: "User-facing Appaloft configuration file fields."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "config file"
  - "appaloft config"
  - "repository config"
relatedOperations: []
sidebar:
  label: "Config file"
  order: 6
---

<h2 id="environment-config-file-purpose">Configuration file purpose</h2>

Configuration files are for reviewable project, resource, environment, and deployment defaults. Do not commit secret values.

<h2 id="environment-config-file-fields">Field groups</h2>

Explain fields by project, resource, environment, deployment, and access concerns instead of internal implementation terms.

<h2 id="environment-config-file-env">Environment values</h2>

Use `env` for non-secret values and `secrets` for references to values supplied outside the
repository:

```yaml
env:
  APP_URL: "http://{pr_number}.preview.example.com"
secrets:
  APP_SECRET:
    from: ci-env:APP_SECRET
    required: true
```

In pull request preview deploys, non-secret `env` values may use `{pr_number}` and `{preview_id}`.
Secret values themselves must stay in GitHub Secrets, another CI secret store, or Appaloft-managed
secrets.

<h2 id="environment-config-file-control-plane">Control plane</h2>

Use `controlPlane` for reviewable deployment ownership defaults:

```yaml
controlPlane:
  mode: none
```

Use `mode: none` for pure CLI or Action SSH deployments. Use `mode: self-hosted` with a trusted
`url` when a self-hosted Appaloft server should own deployment state and Action should call the
server API instead of mutating SSH PGlite directly.

`controlPlane.url` is not a secret, but it must be an `http` or `https` origin without credentials,
path, query, or fragment. Keep tokens, SSH keys, repository identity, project ids, and resource ids
outside repository config.
