# SSH Credential Lifecycle Workflow Spec

## Normative Contract

SSH credential lifecycle operations manage reusable SSH login material and safe visibility around
where that material is referenced.

The current active operations are:

- `credentials.create-ssh`;
- `credentials.list-ssh`;
- `credentials.show`;
- `credentials.delete-ssh`;
- `servers.configure-credential`.

Rotate/update remains a future mutation. It must not be exposed through Web, CLI, HTTP/oRPC,
automation, or future MCP tools until its command boundary, safety rules, error contract, and tests
are accepted.

## Global References

This workflow inherits:

- [Domain Model](../DOMAIN_MODEL.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [Server Bootstrap And Proxy Workflow](./server-bootstrap-and-proxy.md)
- [Deployment Target Lifecycle Workflow](./deployment-target-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md)
- [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md)
- [SSH Credential Lifecycle Implementation Plan](../implementation/ssh-credential-lifecycle-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Workflow Purpose

This workflow gives operators a safe way to:

1. Create a reusable SSH private-key credential.
2. List masked reusable credential summaries for selection.
3. Attach a reusable credential to a deployment target/server through `servers.configure-credential`.
4. Inspect one credential's masked metadata and usage before future rotation or deletion.

Credential detail is visibility, not validation. It does not prove that a key can connect to a
server and does not replace `servers.test-connectivity`.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Create reusable SSH key credential | `credentials.create-ssh` | Credential library state | Server credential attachment, connectivity, deployment, runtime, or proxy state |
| List reusable SSH key credentials | `credentials.list-ssh` | Nothing | Credential material, server state, connectivity, runtime, or proxy state |
| Show reusable SSH credential detail and usage | `credentials.show` | Nothing | Credential material, server state, connectivity, runtime, proxy, terminal, or deployment state |
| Delete unused reusable SSH credential | `credentials.delete-ssh` | Credential library state | Server credential attachment, active/inactive server references, connectivity, deployment, runtime, proxy, terminal, logs, or audit state |
| Attach credential to server | `servers.configure-credential` | DeploymentTarget credential reference/snapshot | Credential library mutation, connectivity, deployment, runtime, or proxy state |

Generic credential mutation operations such as `credentials.update` are not accepted business
behavior. Future credential mutations must use intention-revealing command names.

## Entry Flow

Reusable credential creation:

```text
credentials.create-ssh(input)
  -> credentials.list-ssh()
```

Credential selection during server registration or Quick Deploy:

```text
credentials.list-ssh()
  -> optional credentials.create-ssh(input)
  -> servers.configure-credential(serverId, stored-ssh-private-key reference)
```

Credential detail and usage visibility:

```text
credentials.list-ssh()
  -> credentials.show(credentialId, includeUsage = true)
```

Delete-when-unused starts from the same usage visibility:

```text
credentials.show(credentialId)
  -> credentials.delete-ssh(credentialId, confirmation.credentialId)
```

## Safety And Redaction Rules

Credential read models may expose:

- credential id;
- display name;
- kind;
- default username when configured;
- public-key-configured boolean;
- private-key-configured boolean;
- creation timestamp;
- safe server usage summaries.

Credential read models must not expose:

- private key material;
- public key body unless a future spec explicitly defines a fingerprint-only representation;
- key file paths;
- SSH agent socket paths;
- passphrases;
- raw SSH command lines;
- provider credentials;
- deployment logs or terminal transcript excerpts.

Usage visibility is based on durable server/deployment-target records that reference a reusable
credential id. Direct private-key attachments and local SSH agent attachments are not usage of a
reusable SSH credential.

Credential delete safety uses the same usage meaning:

- `usage.totalServers = 0` is required before deletion can proceed;
- active visible server references block deletion;
- inactive visible server references block deletion;
- direct private-key and local-SSH-agent server credentials are not reusable credential usage;
- deleted server tombstones are omitted from the first active delete safety surface;
- usage-read failure rejects deletion and must not be treated as zero usage.

The persistence adapter must guard the physical PG/PGlite delete so deletion cannot clear
active/inactive server credential references through foreign-key behavior.

## Relationship To Server Lifecycle

`servers.show` remains the server-owned detail query and may show the server's current masked
credential summary.

`credentials.show` is credential-owned. It shows all normal visible servers that reference the
credential so operators can understand blast radius before a future rotate or delete operation.

`servers.delete-check` may include a credential blocker for attached credential state. That blocker
does not replace `credentials.show`; delete-check is server-owned safety preview, while
`credentials.show` is credential-owned usage visibility.

## Relationship To Quick Deploy

Quick Deploy may list, create, and attach credentials as entry-workflow steps before
`deployments.create`.

Quick Deploy must not:

- store credential material inside deployment input;
- select credential identity from committed repository config;
- hide credential creation or attachment behind `deployments.create`;
- infer credential usage by scanning local files or command history.

## Entrypoint Surface Decisions

| Surface | Decision |
| --- | --- |
| CLI | `appaloft server credential-show <credentialId>` dispatches `ShowSshCredentialQuery`; `appaloft server credential-delete <credentialId> --confirm <credentialId>` dispatches `DeleteSshCredentialCommand`. Both use structured command/query schemas. |
| HTTP/oRPC | `GET /api/credentials/ssh/{credentialId}` uses `ShowSshCredentialQueryInput`; `DELETE /api/credentials/ssh/{credentialId}` uses `DeleteSshCredentialCommandInput`; no parallel transport-only schema. |
| Web | Server detail exposes credential detail/usage when its masked credential summary contains a stored reusable credential id. The saved SSH credentials surface opens a destructive confirmation dialog, re-reads usage, requires exact credential-id confirmation, and dispatches `credentials.delete-ssh` through the typed oRPC client only when usage is zero. |
| Repository config | Not applicable. Repository config must not select credential identity or raw credential material. |
| Future MCP/tools | Generate future read/write credential tools from operation catalog entries and reuse the same command/query schemas. |
| Public docs | Reuse existing `server.ssh-credential` help anchor for show and delete; it must explain zero-usage deletion, in-use rejection, usage-read-unavailable rejection, and Web/CLI/API entrypoints. |

## ADR Decision

No new ADR is required for `credentials.show` because it is read-only.

No new ADR is required for `credentials.delete-ssh` because it is an intention-revealing aggregate
mutation under ADR-026, deletes only the credential library row, does not detach or rewrite server
credential state, does not change credential custody, does not introduce async acceptance, and keeps
usage safety inside existing durable server usage visibility. Future rotation, audit retention,
server detachment, secret-store migration, or tombstone-retention behavior may require ADR
escalation.

## Current Implementation Notes And Migration Gaps

The current implementation has reusable SSH credential create/list/delete, server credential
attachment, server detail masked credential summaries, one-credential masked detail plus
active/inactive server usage visibility, and Web saved-credential destructive deletion guarded by
typed confirmation and usage re-read.

`credentials.show` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, API/oRPC,
contracts, Web server detail, and tests.

`credentials.delete-ssh` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI,
API/oRPC, contracts, persistence, Web, and tests.

Credential rotate/update remains future behavior.

## Open Questions

- None for read-only credential detail and normal active/inactive server usage visibility.
