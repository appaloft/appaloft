---
title: "Dependency resources"
description: "Manage dependency resources, bindings, secret rotation, backup, and restore."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dependency"
  - "postgres"
  - "redis"
  - "backup"
  - "binding"
  - "runtime injection"
  - "DATABASE_URL"
relatedOperations:
  - blueprints.list
  - blueprints.show
  - blueprints.plan-install
  - blueprints.install
  - blueprints.installation.show
  - dependency-resources.provision
  - dependency-resources.import
  - dependency-resources.provisioning.plan
  - dependency-resources.provisioning.accept
  - dependency-resources.provisioning.status
  - dependency-resources.list
  - dependency-resources.count
  - dependency-resources.show
  - dependency-resources.rename
  - dependency-resources.delete
  - dependency-resources.create-backup
  - dependency-resources.list-backups
  - dependency-resources.show-backup
  - dependency-resources.restore-backup
  - dependency-resources.backup-policies.configure
  - dependency-resources.backup-policies.list
  - dependency-resources.backup-policies.show
  - resources.bind-dependency
  - resources.unbind-dependency
  - resources.rotate-dependency-binding-secret
  - resources.list-dependency-bindings
  - resources.show-dependency-binding
sidebar:
  label: "Dependency resources"
  order: 6
---

<h2 id="dependency-resource-lifecycle">Dependency resource lifecycle</h2>

A dependency resource is Appaloft's record for a database or service dependency. Phase 7 supports
provider-neutral Postgres, Redis, MySQL, ClickHouse, S3/MinIO object storage, and OpenSearch
records, Appaloft-managed realization, imported external dependencies, safe read models, delete
safety checks, and backup/restore.

```bash title="Create or import dependency resources"
appaloft dependency provision --kind postgres --project prj_prod --environment env_prod --name app-db
appaloft dependency import --kind redis --project prj_prod --environment env_prod --name cache --connection-url redis://cache.internal:6379/0
# For credentials in automation, pipe the URL instead of putting it in the process arguments.
printf '%s\n' "$DATABASE_URL" | appaloft dependency import --kind postgres --project prj_prod --environment env_prod --name external-db --connection-url-stdin
```

List/show output must mask connection secrets, provider tokens, passwords, and raw connection URLs.

<h2 id="blueprint-dependency-contract">Blueprint dependency contract</h2>

Blueprint resources declare dependency requirements with a neutral contract. Use `kind` for the
portable provisioning primitive, `engine.family` for the concrete engine family, `version` for a
preferred version or range, `capabilities` for requirements such as Postgres extensions, `outputs`
for safe field names such as `host`, `port`, `database`, `username`, `password`, and `url`, and
`readiness` for protocol-specific gates.

Components consume dependency outputs through `dependencyEnv`. The plan records only environment
variable names, output field names or templates, and whether the result is secret. It does not store
raw passwords or connection strings. If an output or template includes a password-bearing URL, the
result is secret even when the author omits or weakens the `secret` flag.

Use `valueFrom: url` when the application accepts the provider's standard connection URL:

```yaml title="URL dependency env"
resources:
  - id: postgres
    kind: postgres
    label: App Postgres
components:
  - id: app
    usesResources:
      - postgres
    dependencyEnv:
      - resource: postgres
        name: DATABASE_URL
        valueFrom: url
```

Use split field mappings when an application expects separate host, port, user, and password
variables:

```yaml title="Split field dependency env"
dependencyEnv:
  - resource: postgres
    name: DB_HOST
    valueFrom: host
  - resource: postgres
    name: DB_PORT
    valueFrom: port
  - resource: postgres
    name: DB_NAME
    valueFrom: database
  - resource: postgres
    name: DB_USER
    valueFrom: username
    secret: true
  - resource: postgres
    name: DB_PASSWORD
    valueFrom: password
```

Use `template` when the runtime needs a product-specific URL shape. Template placeholders can only
reference supported dependency outputs:

```yaml title="Template dependency env"
dependencyEnv:
  - resource: redis
    name: REDIS_URL
    template: "redis://${username}:${password}@${host}:${port}/0"
```

Use `kind: mysql` with `engine.family: mariadb` for MariaDB. The dependency remains a
MySQL-compatible provisioning and binding primitive, while the engine family drives provider
selection, readiness, version matching, and generated output semantics.

<h2 id="blueprint-catalog-installation">Blueprint catalog and installation</h2>

The Blueprint catalog is the neutral Blueprint discovery and installation entrypoint. It is not the
same as Cloud marketplace policy. List/show expose portable manifests, components, dependency
requirements, storage requirements, and safe metadata. Install plan previews the Resource,
DependencyResource, StorageVolume, binding, and deployment intents. Install accepts the plan and
creates the corresponding resources.

```bash title="Inspect and install a Blueprint"
appaloft blueprint list
appaloft blueprint show pocketbase
appaloft blueprint plan-install pocketbase
appaloft blueprint install pocketbase
appaloft blueprint installation show app_123
```

Application bundle readback must show dependency bindings separately from storage bindings.
Databases, Redis, object storage, OpenSearch, and similar service dependencies use
DependencyResource. PocketBase SQLite files, uploads, model caches, and other mounted application
data use StorageVolume. Blueprint installation must not turn volumes into dependency resources, and
volume data must not be handled through dependency backup/restore.

<h2 id="dependency-resource-binding">Bind to a Resource</h2>

A Resource dependency binding lets future deployment snapshots reference a dependency resource. The
binding stores only provider-neutral safe metadata and secret references. It does not place database
URLs or passwords on the Resource, and you do not pass database URLs to `deployments.create`.

```bash title="Bind a dependency resource"
appaloft resource dependency bind res_web --dependency dep_db --target DATABASE_URL
```

Unbind removes only the association. It does not delete the database, restart runtime, or rewrite
historical deployment snapshots.

<h2 id="dependency-config-file">Declare dependencies in appaloft.yaml</h2>

Repository config can declare an application dependency graph for config-driven CLI and GitHub
Action deployments:

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

During config deploy, Appaloft lists existing dependency resources and bindings, provisions a
managed dependency when needed, binds the selected Resource to the requested environment variable,
and then creates the deployment with ids only. Repository config accepts `postgres`, `redis`,
`mysql`, `clickhouse`, `object-storage`, and `opensearch` for managed dependency declarations. The
runtime receives the value through the same safe dependency runtime injection path described below.

To bind an external dependency that was already imported through `appaloft dependency import`, use
its stable Appaloft Resource name:

```yaml
dependencies:
  db:
    resourceName: StockTruth Supabase
    kind: postgres
    source: imported
    bind:
      env: DATABASE_URL
```

`source: imported` never creates or imports infrastructure. The named dependency must already exist
in the same Project and Environment, match the declared kind, and be ready; otherwise deployment
fails before provisioning or binding. Imported dependencies cannot use ephemeral preview lifecycle.
Connection strings and provider credentials remain in Appaloft's dependency secret custody, not in
repository config.

Do not put provider accounts, tenants, credentials, database passwords, raw connection strings, or
secret values in `appaloft.yaml`. `controlPlane.install.database` is only for the Appaloft
control-plane installer database and is not an application dependency database.

For PR previews, `preview.lifecycle: ephemeral` lets preview cleanup unbind and delete only the
dependency that has explicit repository-config provenance for that preview. Shared, manually bound,
imported, or otherwise unproven dependencies are not deleted by preview cleanup.

Use `backup` when a managed dependency should have scheduled restore points:

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
      retryOnFailure: true
```

Config deploy reconciles this through dependency backup policy operations. It does not run backup or
restore work, and `appaloft.yaml` must not contain policy ids, provider keys, backup artifact
handles, restore point ids, raw dump paths, provider accounts, credentials, or secret values.

<h2 id="dependency-runtime-injection">Deploy with bound dependencies</h2>

When a Resource has active ready dependency bindings, Appaloft includes safe runtime injection
readiness in deployment plan and deployment detail output. A binding can be delivered when the
dependency is ready, the binding targets a runtime environment variable such as `DATABASE_URL` or
`REDIS_URL`, and the selected runtime target supports dependency secret delivery.

```bash title="Preview dependency runtime injection before deploying"
appaloft deployments plan --project prj_prod --environment env_prod --resource res_web --server srv_prod
appaloft deployments show dep_123
```

`deployments.create` does not accept dependency connection strings. Appaloft captures the current
safe binding reference in the deployment snapshot and asks the runtime target to provide the
configured environment variable to the workload. Historical deployment snapshots keep their captured
reference after later binding secret rotation.

<h2 id="dependency-runtime-injection-blocked">Blocked runtime injection</h2>

Plan and show output report dependency runtime injection as `ready`, `blocked`, or
`not-applicable`. `blocked` means at least one active binding cannot be delivered safely for the
selected runtime target. Common safe reasons include a not-ready dependency, missing safe secret
reference, an unresolved stored dependency secret, unsupported dependency kind, unsupported scope or
injection mode, duplicate target name, an existing environment-variable conflict, or a runtime
target that cannot deliver dependency secrets.

When `deployments.create` sees the same blocked state, it rejects the deployment before acceptance
with `dependency_runtime_injection_blocked`. No deployment attempt is created, and the response does
not expose raw connection strings, passwords, or provider payloads. Fix the dependency resource,
binding, target name, or runtime target, then run plan again before deploying.

<h2 id="dependency-secret-rotation">Binding secret rotation</h2>

`resources.rotate-dependency-binding-secret` replaces only the safe secret reference or version on
the binding. It affects future deployment snapshots. It does not rotate provider-native database
passwords, update running container environment variables, or rewrite historical deployments.

After rotating, create a new deployment so the workload reads the new snapshot reference.

<h2 id="dependency-backup-restore">Backup and restore</h2>

Backup creates a safe restore point. Restore targets the same dependency by default, or an existing
ready same-kind dependency in the same project and environment when `--target-dependency` is
supplied. Both paths require explicit acknowledgement that data may be overwritten and runtime will
not restart automatically.

```bash title="Backup and restore"
appaloft dependency backup create dep_db
appaloft dependency backup list dep_db
appaloft dependency backup restore bkp_123
appaloft dependency backup restore bkp_123 --target-dependency dep_external --confirm-data-overwrite --confirm-runtime-not-restarted
```

For imported dependencies with an Appaloft-owned connection reference, the shell provider runs
native Postgres dump/restore or Redis logical backup/restore. Provider-owned or unresolved
references still produce safe metadata-only restore points until that provider supplies its own
backup substrate. Raw connection values never appear in backup artifacts, read models, events, or
errors.

Cross-resource restore records the selected target but does not switch application traffic. Restore
does not mutate ResourceBindings, deployment rollback/redeploy state, workload processes, or
historical deployment snapshots. Dependency delete must be blocked while retained backups or
in-flight restores remain.

Scheduled backup policies are opt-in records. They do not run unless the self-hosted shell enables
the scheduled dependency backup runner. A due policy dispatches the same
`dependency-resources.create-backup` operation as manual backup creation and records safe process
attempt metadata for operator review.

```bash title="Configure scheduled dependency backups"
appaloft dependency backup policy configure dep_db --retention-days 7 --interval-hours 24
appaloft dependency backup policy list dep_db
appaloft dependency backup policy show dbp_123
```

<h2 id="dependency-delete-safety">Delete safety</h2>

Before deleting a dependency resource, Appaloft checks active bindings, backup retention, deployment
snapshot references, and provider-managed safety state. Imported external delete removes only the
Appaloft control-plane record; it does not delete the external database.

When delete is blocked, inspect dependency detail, binding list, and backup list before explicitly
removing the relevant references.
