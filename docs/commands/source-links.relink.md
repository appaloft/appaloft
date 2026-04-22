# source-links.relink Command Spec

## Normative Contract

`source-links.relink` intentionally moves a source fingerprint link to a selected Appaloft
project/resource/environment/server context.

It is the operator escape hatch for pure CLI and GitHub Actions workflows that reuse source
fingerprint link state from SSH-server `ssh-pglite` or a future control plane. Relink is never
driven by committed repository config and is never a hidden side effect of `deployments.create`.

Command success means the source link mapping has been updated. It does not deploy the resource,
mutate resource source/runtime/network profile fields, change environment variables, alter server
credentials, or rewrite deployment history.

```ts
type RelinkSourceResult = Result<
  {
    sourceFingerprint: string;
    projectId: string;
    environmentId: string;
    resourceId: string;
    serverId?: string;
    destinationId?: string;
  },
  DomainError
>;
```

## Global References

This command inherits:

- [ADR-024: Pure CLI SSH State And Server-Applied Domains](../decisions/ADR-024-pure-cli-ssh-state-and-server-applied-domains.md)
- [ADR-028: Command Coordination Scope And Mutation Admission](../decisions/ADR-028-command-coordination-scope-and-mutation-admission.md)
- [Repository Deployment Config File Bootstrap](../workflows/deployment-config-file-bootstrap.md)
- [Quick Deploy Workflow](../workflows/quick-deploy.md)
- [Source Link Durable Persistence Implementation Plan](../implementation/source-link-durable-persistence-plan.md)
- [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md)
- [Deployment Config File Test Matrix](../testing/deployment-config-file-test-matrix.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Relink exists because automatic source fingerprint reuse is required for repeatable CLI/Action
deployments, but automatic retargeting is unsafe. When a repository or source path was linked to the
wrong resource, or an operator intentionally wants to move it, relink makes that change explicit and
auditable.

## Input Model

| Field | Requirement | Meaning |
| --- | --- | --- |
| `sourceFingerprint` | Required unless a structured source selector is supplied | Stable, normalized, secret-free source identity to move. |
| `sourceSelector` | Optional alternative | Structured source locator/base directory/config identity used by entrypoints to derive the fingerprint. |
| `expectedCurrentProjectId` | Optional | Optimistic guard against relinking a different current mapping than the operator reviewed. |
| `expectedCurrentEnvironmentId` | Optional | Optional guard for current environment scope. |
| `expectedCurrentResourceId` | Optional | Optional guard for current resource mapping. |
| `projectId` | Required | Target project for future source-link resolution. |
| `environmentId` | Required | Target environment or environment scope for future source-link resolution. |
| `resourceId` | Required | Target resource for future deployments from the linked source. |
| `serverId` | Optional | Default target/server mapping when the link owns target selection. |
| `destinationId` | Optional | Default destination mapping when the link owns target placement. |
| `reason` | Optional | Operator-provided audit/diagnostic text; must not contain secrets. |

## Admission Flow

The command must:

1. Validate input and derive a canonical source fingerprint when `sourceSelector` is supplied.
2. Resolve the selected state backend and complete any required backend maintenance coordination.
   For SSH mode this may include brief remote `ssh-pglite` state-root coordination before command
   execution.
3. Resolve operation coordination for the command's `source-link` scope using the normalized source
   fingerprint.
4. Wait bounded time for the logical source-link scope or reject with a retriable coordination
   timeout.
5. Load the current link for the fingerprint and scope.
6. Enforce optimistic guards when provided.
7. Resolve target project, environment, resource, and optional server/destination.
8. Reject mismatched project/environment/resource ownership.
9. Update the source link mapping.
10. Persist safe audit metadata and config/source origin metadata.
11. Return the new mapping.

## Rules

- Relink must be explicit. Regular deploy may create a first link or reuse an existing link, but it
  must not move an existing link to another resource just because config changed.
- Relink is idempotent when the current mapping already equals the requested mapping.
- Relink must not mutate `ResourceSourceBinding`, `ResourceRuntimeProfile`, `ResourceNetworkProfile`,
  environment variables, credentials, deployment attempts, domain bindings, or server-applied route
  state.
- Relink uses source-fingerprint scoped operation coordination in addition to any low-level
  state-root coordination needed by the selected backend.
- Relink must not accept raw credentials, raw config files, or committed config identity selectors
  as proof of target ownership.
- Relink should record safe audit metadata so `system.doctor` or future source-link queries can
  explain why a repeated deploy selected a resource.

## Persistence Model

`SourceLinkStore` is application state in the selected Appaloft state backend. It is not a
`Resource` aggregate field and it is not committed repository config.

For PostgreSQL-compatible backends, the canonical v1 table shape is:

```text
source_links
  source_fingerprint text primary key
  project_id text not null references projects(id)
  environment_id text not null references environments(id)
  resource_id text not null references resources(id)
  server_id text null references servers(id)
  destination_id text null references destinations(id)
  updated_at timestamptz not null
  reason text null
  metadata jsonb not null default '{}'
```

Indexes must support:

- exact lookup by `source_fingerprint`;
- reverse lookup by `resource_id` for `resources.delete` deletion guards.

The table must not cascade-delete resources. A link pointing at a resource is a retained identity
record and must be reported as a `source-link` deletion blocker until an explicit unlink/relink
behavior, such as `deployments.cleanup-preview` for preview-scoped links or `source-links.relink`,
changes that record.

PG/PGlite source-link persistence must be implemented inside `packages/persistence/pg`; no Kysely
or Postgres driver types may leak into `application`, CLI, shell business logic, or core.

The existing file-backed SSH mirror source-link store remains valid for SSH remote-state transfer,
but when the selected Appaloft backend is PostgreSQL/PGlite, command execution must use the PG
adapter so `source-links.relink`, repository config bootstrap, and `resources.delete` see the same
authoritative state.

## Entrypoints

| Entrypoint | Contract |
| --- | --- |
| CLI | `appaloft source-links relink <sourceFingerprint> --project <id> --environment <id> --resource <id>` accepts the fingerprint and explicit target ids, then dispatches this command. SSH pure CLI mode uses trusted SSH target options such as `--server-host` to select and lock remote PGlite state before command execution. |
| API/oRPC | Future endpoint may expose the same command schema for hosted/self-hosted control planes. |
| Web | Future resource/source settings may call the same command after showing current and target mapping. |
| GitHub Actions | Action deploys must not relink implicitly; they may fail with relink-required guidance. |

## Error Contract

| Code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `source-link-validation` | No | Fingerprint or selector is missing, malformed, secret-bearing, or ambiguous. |
| `source_link_not_found` | `source-link-resolution` | No | Relink required an existing link but none exists. |
| `source_link_conflict` | `source-link-resolution` | No | Optimistic guard did not match the current link. |
| `source_link_context_mismatch` | `source-link-admission` | No | Target project/environment/resource/server/destination relationship is invalid. |
| `infra_error` | `remote-state-lock` | Yes | State backend lock could not be acquired. |
| `coordination_timeout` | `operation-coordination` | Yes | The command could not acquire its logical source-link coordination scope within the bounded wait window. |
| `infra_error` | `source-link-persistence` | Conditional | Link update could not be persisted. |

## Tests

The governing matrix is [Source Link State Test Matrix](../testing/source-link-state-test-matrix.md).
At minimum, Test-First Round must cover:

- first-run link creation by config deploy;
- repeated deploy reusing the link;
- deploy refusing to retarget without relink;
- relink success and idempotency;
- optimistic guard conflict;
- backend maintenance coordination plus source-link scoped coordination during relink;
- diagnostics with no secret leakage.

## Current Implementation Notes And Migration Gaps

`source-links.relink` is active in the application command surface, operation catalog, and CLI. The
CLI entrypoint accepts explicit target ids and SSH remote-state options, and shell startup mirrors
the selected SSH server's PGlite/source-link state before dispatching the command.

The current implementation validates project/environment/resource/server/destination relationships
against the active Appaloft state backend before updating the source link. Shell runtime uses the
PG/PGlite `SourceLinkStore` adapter for command execution, including SSH remote PGlite mirrors.
The file-backed source-link store remains available for adapter-level remote-state transfer and
legacy explicit wiring, but it is not the shell runtime's authoritative source-link store.

Current implementation now applies logical source-link scoped coordination in the shell/runtime
path. In SSH `ssh-pglite` mode, shell still performs brief backend state-root maintenance for
mirror prepare/upload, and final upload may retry after `remote_state_revision_conflict` by merging
non-overlapping PG/PGlite row changes onto a fresher remote snapshot. Overlapping row edits still
fail with a structured infrastructure merge conflict.

PostgreSQL/PGlite source-link persistence is implemented through the `source_links` migration and
PG adapter in `packages/persistence/pg`. `resources.delete` reports `source-link` blockers from
that durable state. API/oRPC and Web relink entrypoints remain future work.

The CLI currently accepts an explicit `sourceFingerprint`; deriving the fingerprint from a
structured `sourceSelector` in the relink command is future entrypoint work.

External SSH e2e coverage must still prove relink state survives a real process and network
boundary. A future source-link query/doctor surface should expose safe diagnostics and current
mapping review before relink.
