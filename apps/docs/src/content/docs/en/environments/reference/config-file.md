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

<h2 id="environment-config-file-runtime">Source and runtime</h2>

Use `source` and `runtime` to describe where the app lives and how Appaloft should build or start
it:

```yaml
source:
  type: git
  repository: https://github.com/acme/api
  baseDirectory: apps/api

runtime:
  strategy: dockerfile
  dockerfilePath: deploy/Dockerfile
  buildTarget: runner
```

For Compose apps, use `strategy: docker-compose` with `dockerComposeFilePath`. For static sites,
use `strategy: static` with `publishDirectory`. These paths are relative to the selected source
root and must not escape it. Keep provider accounts, credentials, registry pull secrets, host paths,
resource sizing, replicas, and rollout policy outside `appaloft.yaml`.

<h2 id="environment-config-file-named-profiles">Named config profiles</h2>

Use `profiles.<key>` for reviewable variants such as staging or smoke deploys. The file declares
the variant, but a trusted entrypoint selects it:

```yaml
runtime:
  start:
    command: bun run start

env:
  APP_ENV: production

profiles:
  staging:
    runtime:
      start:
        command: bun run start:staging
    access:
      generated:
        enabled: true
    env:
      APP_ENV: staging
```

Run it with `appaloft deploy --config appaloft.yml --config-profile staging`, or set
`config-profile: staging` in the GitHub Action. Unselected profiles are ignored. A selected profile
can overlay runtime, network, health, access, monitoring, non-secret env values, and secret
references. It cannot choose project, environment, resource, server, destination, provider account,
or credentials, and it cannot add fields to the final deployment command.

<h2 id="environment-config-file-preview-profile">PR preview profile</h2>

Use `preview.pullRequest.profile` for profile differences that should apply only to a PR preview
deploy selected by trusted entrypoint context:

```yaml
runtime:
  start:
    command: bun run start

env:
  APP_ENV: production

preview:
  pullRequest:
    domainTemplate: pr-{pr_number}.preview.example.com
    profile:
      runtime:
        name: preview-{pr_number}
        start:
          command: bun run preview
      env:
        APP_ENV: preview
```

The overlay is ignored for ordinary deploys. In PR preview deploys, Appaloft merges it after root
config validation and before applying profile/env commands. It cannot choose project,
environment, resource, server, destination, provider account, or credentials, and it cannot add
fields to the final deployment command.

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

<h2 id="environment-config-file-runtime-prune">Runtime prune policy</h2>

Use `retention.runtimePrune` when a selected deployment target should have a scheduled runtime
cleanup policy for deployment-snapshot cleanup:

```yaml
retention:
  runtimePrune:
    retentionDays: 14
    destructive: false
    categories:
      - stopped-containers
      - preview-workspaces
    retryOnFailure: true
    enabled: true
```

Config deploy applies this after trusted server resolution and before deployment admission by
configuring a deterministic `deployment-snapshot` scheduled runtime prune policy. It does not put
retention fields on the final deployment command, and it does not let the committed file select a
server, organization, project, environment, policy id, provider account, credential, host path, raw
Docker/SSH command, volume prune, audit/event/log retention policy, or secret value.

`destructive` defaults to `false`. Destructive scheduled cleanup is still gated by the policy and
runs through the existing server capacity prune safety checks.

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
  EXISTING_RESOURCE_SECRET:
    from: resource-secret:EXISTING_RESOURCE_SECRET
```

In pull request preview deploys, non-secret `env` values may use `{pr_number}` and `{preview_id}`.
`ci-env:<NAME>` resolves from a trusted runner environment and stores the value as a runtime
environment secret before deployment. `resource-secret:<KEY>` declares that the selected Resource
must already have a matching runtime Resource secret reference; config deploy verifies the masked
reference and never reads, copies, or writes the secret value.

Secret values themselves must stay in GitHub Secrets, the selected CI runner environment, or
Resource secret commands. External secret adapters beyond `ci-env:` and `resource-secret:` are not
repository config resolvers yet.

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
