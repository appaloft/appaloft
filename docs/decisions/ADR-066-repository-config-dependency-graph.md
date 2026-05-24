# ADR-066: Repository Config Dependency Graph

Status: Accepted

Date: 2026-05-24

## Decision

Repository config may declare an application dependency graph under `dependencies`. The graph is a
user-facing deployment workflow profile, not a new deployment command schema and not a serialization
of `DependencyResource` or `ResourceBinding` internals.

The accepted shape is:

```yaml
dependencies:
  db:
    kind: postgres
    source: managed
    bind:
      env: DATABASE_URL
  cache:
    kind: redis
    source: managed
    bind:
      env: REDIS_URL
    preview:
      lifecycle: ephemeral
```

The config workflow must translate each dependency declaration into existing application operations:

```text
appaloft.yaml dependencies
  -> dependency-resources.list
  -> dependency-resources.provision when no managed resource exists
  -> resources.list-dependency-bindings
  -> resources.bind-dependency when no active matching binding exists
  -> deployments.create(projectId, environmentId, resourceId, serverId, destinationId?)
```

`deployments.create` remains ids-only. Runtime injection continues to flow through active
`ResourceBinding` records, deployment snapshot materialization, and runtime target adapters as
defined by ADR-040 and ADR-041.

For pull request previews, a dependency declaration with `preview.lifecycle: ephemeral` may create
or reuse a dependency resource inside the preview scope. Cleanup may unbind and delete only
dependencies whose source-link metadata contains explicit repository-config provenance for the same
preview source fingerprint, resource id, binding id, dependency resource id, dependency key,
managed source, and ephemeral lifecycle.

The minimal durable provenance store is the preview source link metadata. Source links already
represent repository/config ownership for preview-scoped deploy targets, are selected by cleanup,
and have a durable `metadata` column in PG/PGlite plus file-backed state in pure SSH mode. The
provenance format is adapter-internal and safe metadata only:

```ts
type SourceLinkDependencyProvenance = {
  schemaVersion: "source-link.dependency-provenance/v1";
  source: "repository-config";
  sourceFingerprint: string;
  entries: Array<{
    key: string;
    kind: "postgres" | "redis" | "mysql" | "clickhouse" | "object-storage" | "opensearch";
    source: "managed";
    lifecycle: "ephemeral";
    resourceId: string;
    dependencyResourceId: string;
    bindingId: string;
    targetName: string;
    createdAt: string;
  }>;
};
```

Repository config must reject provider accounts, tenants, organization ids, credentials, database
passwords, raw connection strings, raw secret values, and provider-specific realization settings.
`controlPlane.install.database` remains only the Appaloft control-plane installer database selector;
it is not an application dependency declaration.

## Context

Appaloft already has dependency resources, resource dependency bindings, safe runtime injection,
store-backed secret resolution, and preview cleanup. Users still need to perform dependency setup
manually before config-driven deploys, which breaks the repository config promise of reproducible
headless setup for CLI and GitHub Action workflows.

The product need is to express "this app needs a managed dependency and wants it bound as this
runtime env var" in a reviewable file without exposing internal provider credentials or adding
dependency fields to deployment admission.

Preview cleanup requires a stronger rule than naming convention. A preview database may be created
by config, manually bound by an operator, shared by another resource, or retained by policy. Only
explicit repository-config provenance can authorize cleanup of the config-owned ephemeral path.

## Consequences

- Repository config accepts `dependencies.<key>` with strict fields for the Appaloft canonical
  managed dependency kinds: `postgres`, `redis`, `mysql`, `clickhouse`, `object-storage`, and
  `opensearch`.
- The config parser remains strict; external imports, provider accounts, secret values, raw
  connection strings, and unknown fields fail before mutation.
- CLI and Action config deploy run existing command/query buses only. Adapters must not access
  dependency repositories or application services directly.
- Existing bindings are reused only when they match the declared env target and dependency identity.
  A different active binding for the same env target is a stable conflict.
- `dependencies` is a workflow/profile extension over existing operation catalog entries:
  `dependency-resources.list`, `dependency-resources.provision`,
  `resources.list-dependency-bindings`, `resources.bind-dependency`,
  `resources.unbind-dependency`, and `dependency-resources.delete`. It does not introduce a new
  public command key.
- Preview cleanup is extended to unbind/delete provenance-marked ephemeral dependencies after
  runtime cleanup succeeds and before source-link deletion. Delete safety remains enforced by the
  existing dependency delete use case, so shared/manual bindings or backup/snapshot blockers prevent
  unsafe deletion.
- Source-link read surfaces may expose only safe provenance metadata if they expose it at all; no
  secret, credential, provider account, tenant, or raw connection value is stored in provenance.

## Implementation Requirements

- Add `dependencies` to the deployment config parser and JSON schema with strict record keys and
  nested object validation.
- Keep the config dependency graph as user language: `kind`, `source`, `bind.env`, and preview
  lifecycle. Do not expose `ResourceInstance`, `ResourceBinding`, provider payload, provider
  account, or credential terminology in the config shape.
- Add idempotent config deploy orchestration that lists current dependency resources and bindings
  before provisioning or binding.
- Conflict when an active binding already uses the declared env target for a different dependency.
- Persist preview ephemeral provenance only for repository-config-owned preview dependencies and
  only with safe ids.
- Cleanup must not delete dependencies without matching provenance. It must tolerate already
  removed bindings/resources as already-clean for retry, while preserving blocker/conflict failures
  from dependency delete safety.
- Public docs must explicitly distinguish application dependencies from
  `controlPlane.install.database`.

## References

- [Repository Config Dependency Graph](../specs/075-repository-config-dependency-graph/spec.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [GitHub Action PR Preview Deploy](../workflows/github-action-pr-preview-deploy.md)
- [deployments.cleanup-preview](../commands/deployments.cleanup-preview.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Dependency Resource Test Matrix](../testing/dependency-resource-test-matrix.md)
- [ADR-040: Dependency Binding Runtime Injection Boundary](./ADR-040-dependency-binding-runtime-injection-boundary.md)
- [ADR-041: Dependency Runtime Secret Value Resolution](./ADR-041-dependency-runtime-secret-value-resolution.md)
