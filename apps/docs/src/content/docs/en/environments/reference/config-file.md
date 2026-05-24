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

<h2 id="environment-config-file-health">Health policy</h2>

Use `health` when the Resource should have a reusable HTTP health policy:

```yaml
health:
  enabled: true
  path: /ready
  intervalSeconds: 5
  timeoutSeconds: 5
  retries: 10
```

Config deploy stores this as Resource health policy through `resources.configure-health` when an
existing Resource profile apply is explicitly acknowledged. New Resources receive the same policy
in their profile. The final deployment command still contains only Appaloft ids; health config does
not run probes, restart workloads, mark a Resource healthy, or change historical deployment
snapshots.

`runtime.healthCheckPath` remains a shorthand for the HTTP path. Keep command health checks,
request headers, raw probe response bodies, credentials, tokens, local file paths, and provider
accounts outside `appaloft.yaml`.

<h2 id="environment-config-file-dependencies">Application dependencies</h2>

Use `dependencies` when the application needs Appaloft to manage and bind an application dependency
before deployment:

```yaml
dependencies:
  db:
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL
    backup:
      enabled: true
      intervalHours: 24
      retentionDays: 7
  cache:
    kind: redis
    source: managed
    bind:
      env: REDIS_URL
    preview:
      lifecycle: ephemeral
```

This declares managed application dependencies and asks Appaloft to inject them through the
existing dependency binding runtime path as environment variables such as `DATABASE_URL` and
`REDIS_URL`. Supported managed kinds are `postgres`, `redis`, `mysql`, `clickhouse`,
`object-storage`, and `opensearch`. The final deployment command still contains only Appaloft ids;
connection strings and database passwords do not belong in `appaloft.yaml`.

`backup` configures scheduled backup policy for the dependency resource. It does not run a backup
or restore during deploy. Do not commit backup policy ids, provider keys, backup artifact handles,
restore point ids, or raw dump paths.

For pull request previews, `preview.lifecycle: ephemeral` allows preview cleanup to remove only the
dependency resource that Appaloft can prove was created and bound by this config for that preview.
Manual or shared dependency resources are preserved.

<h2 id="environment-config-file-storage">Application storage</h2>

Use `storage` when the application needs Appaloft to manage and mount a persistent named volume
before deployment:

```yaml
storage:
  uploads:
    kind: volume
    source: managed
    mount:
      path: /app/uploads
      mode: read-write
    preview:
      lifecycle: ephemeral
```

This declares a managed storage volume and asks Appaloft to attach it to the Resource profile at
`/app/uploads`. The final deployment command still contains only Appaloft ids; host bind paths,
provider accounts, provider-native handles, backup handles, and secret values do not belong in
`appaloft.yaml`.

For pull request previews, `preview.lifecycle: ephemeral` allows preview cleanup to detach and
delete only the storage volume that Appaloft can prove was created and attached by this config for
that preview. Manual or shared storage is preserved.

<h2 id="environment-config-file-generated-access">Generated access</h2>

Use `access.generated` when the Resource should opt in or out of generated default access, or when
generated access should use a path prefix:

```yaml
access:
  generated:
    enabled: true
    pathPrefix: /
```

`enabled: true` keeps the Resource eligible for generated default access when the selected server,
network profile, proxy, and default access policy support it. `enabled: false` disables generated
default access for this Resource only. `pathPrefix` applies only to generated default access routes.

This does not create custom domains, issue certificates, change the default access provider policy,
or add access fields to the final deployment command. Keep provider accounts, DNS/certificate
provider credentials, route ids, certificate ids, private keys, tokens, and raw certificate material
outside `appaloft.yaml`.

<h2 id="environment-config-file-monitoring-thresholds">Runtime monitoring thresholds</h2>

Use `monitoring.thresholds` when the Resource should have reviewable, non-enforcing runtime
monitoring warning or critical thresholds:

```yaml
monitoring:
  thresholds:
    enabled: true
    rules:
      - signal: cpu
        metric: containerCpuPercent
        warning: 70
        critical: 90
```

Thresholds are observation policy only. They can make resource monitoring readback show warning or
critical state, but they do not resize, scale, reject, restart, clean up, alert, bill, or mutate the
running workload. Config deploy creates or updates only the exact Resource-scope threshold policy;
it does not mutate inherited server, project, environment, or deployment policies.

Keep policy ids, scope ids, provider accounts, container ids, sample ids, host paths, raw metric
payloads, log lines, credentials, private keys, tokens, and raw secret values outside
`appaloft.yaml`.

<h2 id="environment-config-file-scheduled-tasks">Scheduled tasks</h2>

Use `scheduledTasks` when the application needs recurring Resource-owned jobs:

```yaml
scheduledTasks:
  nightly_sync:
    schedule: "0 3 * * *"
    timezone: UTC
    command: bun run sync
    timeoutSeconds: 600
    retryLimit: 2
    preview:
      lifecycle: ephemeral
```

This creates or configures a scheduled task before deployment. The final deployment command still
contains only Appaloft ids; task ids, provider-native scheduler handles, target identity, raw
connection strings, tokens, and passwords do not belong in `appaloft.yaml`.

For pull request previews, `preview.lifecycle: ephemeral` allows preview cleanup to delete only the
scheduled task that Appaloft can prove was created or adopted by this config for that preview.
Manual or shared scheduled tasks are preserved.

<h2 id="environment-config-file-auto-deploy">Auto-deploy policy</h2>

Use `autoDeploy` when the Resource should deploy after matching source events:

```yaml
autoDeploy:
  enabled: true
  trigger: git-push
  refs:
    - main
  events:
    - push
  dedupeWindowSeconds: 300
```

This configures Resource auto-deploy policy before deployment. The final deployment command still
contains only Appaloft ids; source-event ids, webhook delivery ids, provider accounts, webhook
secrets, tokens, and passwords do not belong in `appaloft.yaml`. Use `enabled: false` to disable an
existing auto-deploy policy from config.

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
path, query, or fragment. Keep tokens, SSH keys, repository identity, organization/tenant/provider
account identity, database URLs, secret values, and broad target identity outside repository config.

`controlPlane.install.database` configures the database backend for installing Appaloft itself. It
does not create an application database. Use top-level `dependencies` for application dependencies.

For self-hosted Action deploys, project/environment/resource/server ids are not required in the
common path. The server should resolve the target from source-link state, deploy-token scope, source
binding, or trusted GitHub repository/ref/revision/preview context. `controlPlane.deploymentContext`
is reserved for narrow one-time bootstrap, relink, override, or support/debug workflows and must
contain only project, environment, resource, server, and optional destination ids.

```yaml
controlPlane:
  mode: self-hosted
  url: https://console.example.com
  deploymentContext:
    projectId: prj_www
    environmentId: env_prod
    resourceId: res_www
    serverId: srv_prod
```
