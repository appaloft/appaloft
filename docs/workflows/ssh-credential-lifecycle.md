# SSH Credential Lifecycle Workflow Spec

## Normative Contract

SSH credential lifecycle operations manage reusable SSH login material and safe visibility around
where that material is referenced.

The current active operations are:

- `credentials.create-ssh`;
- `credentials.list-ssh`;
- `credentials.show`;
- `credentials.delete-ssh`;
- `credentials.rotate-ssh`;
- `servers.configure-credential`.

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
- [credentials.rotate-ssh Command Spec](../commands/credentials.rotate-ssh.md)
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
4. Inspect one credential's masked metadata and usage before rotation or deletion.
5. Rotate one stored reusable credential in place while preserving server references.

Credential detail is visibility, not validation. It does not prove that a key can connect to a
server and does not replace `servers.test-connectivity`.

Credential rotation is mutation, not validation. A successful rotation means new credential material
was stored for the same credential id. It does not prove that affected servers accept the new key.

## Operation Boundaries

| User intent | Operation | Mutates | Must not mutate |
| --- | --- | --- | --- |
| Create reusable SSH key credential | `credentials.create-ssh` | Credential library state | Server credential attachment, connectivity, deployment, runtime, or proxy state |
| List reusable SSH key credentials | `credentials.list-ssh` | Nothing | Credential material, server state, connectivity, runtime, or proxy state |
| Show reusable SSH credential detail and usage | `credentials.show` | Nothing | Credential material, server state, connectivity, runtime, proxy, terminal, or deployment state |
| Delete unused reusable SSH credential | `credentials.delete-ssh` | Credential library state | Server credential attachment, active/inactive server references, connectivity, deployment, runtime, proxy, terminal, logs, or audit state |
| Rotate reusable SSH credential | `credentials.rotate-ssh` | Credential library secret material and safe metadata for the same credential id | Server credential attachment, active/inactive server references, connectivity, deployment, runtime, proxy, terminal, logs, or audit state |
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

In-place rotation starts from usage visibility and remains a credential-owned mutation:

```text
credentials.show(credentialId, includeUsage = true)
  -> credentials.rotate-ssh(
       credentialId,
       privateKey,
       optional publicKey/username replacement,
       confirmation.credentialId,
       confirmation.acknowledgeServerUsage when usage.totalServers > 0
     )
  -> servers.test-connectivity(serverId) for affected active servers
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

Credential rotation uses the same usage meaning for safety visibility, but nonzero usage is not a
hard blocker. Rotation is allowed for active or inactive visible server references only when the
operator explicitly acknowledges the affected usage. The command preserves the credential id, so
servers continue to reference the same reusable credential. Future connectivity checks and
deployments read the rotated material.

Rotation safety rules:

- usage-read failure rejects rotation and must not be treated as zero usage;
- exact credential-id confirmation is always required;
- `acknowledgeServerUsage = true` is required when `usage.totalServers > 0`;
- success must not prove connectivity or mark servers ready;
- users should run `servers.test-connectivity` for affected active servers after rotation;
- omitted `username` preserves the existing default username, `null` clears it, and a string
  replaces it;
- omitted `publicKey` preserves existing public-key metadata, `null` clears it, and a string
  replaces it.

## Relationship To Server Lifecycle

`servers.show` remains the server-owned detail query and may show the server's current masked
credential summary.

`credentials.show` is credential-owned. It shows all normal visible servers that reference the
credential so operators can understand blast radius before a rotate or delete operation.

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
| CLI | `appaloft server credential-show <credentialId>` dispatches `ShowSshCredentialQuery`; `appaloft server credential-delete <credentialId> --confirm <credentialId>` dispatches `DeleteSshCredentialCommand`; `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` dispatches `RotateSshCredentialCommand` and uses `--acknowledge-server-usage` when usage is nonzero. All use structured command/query schemas. |
| HTTP/oRPC | `GET /api/credentials/ssh/{credentialId}` uses `ShowSshCredentialQueryInput`; `DELETE /api/credentials/ssh/{credentialId}` uses `DeleteSshCredentialCommandInput`; `POST /api/credentials/ssh/{credentialId}/rotate` uses `RotateSshCredentialCommandInput`; no parallel transport-only schema. |
| Web | Server detail exposes credential detail/usage when its masked credential summary contains a stored reusable credential id. The saved SSH credentials surface opens destructive delete and rotation dialogs, re-reads usage, requires exact credential-id confirmation, blocks unavailable usage, dispatches `credentials.delete-ssh` only when usage is zero, and dispatches `credentials.rotate-ssh` only after in-use acknowledgement when usage is nonzero. |
| Repository config | Not applicable. Repository config must not select credential identity or raw credential material. |
| Future MCP/tools | Generate future read/write credential tools from operation catalog entries and reuse the same command/query schemas. |
| Public docs | Reuse existing `server.ssh-credential` help anchor for show/delete/rotate. It explains zero-usage deletion, in-use rejection, usage-read-unavailable rejection, in-place rotation, affected usage acknowledgement, post-rotation connectivity testing, and Web/CLI/API entrypoints. |

## ADR Decision

No new ADR is required for `credentials.show` because it is read-only.

No new ADR is required for `credentials.delete-ssh` because it is an intention-revealing aggregate
mutation under ADR-026, deletes only the credential library row, does not detach or rewrite server
credential state, does not change credential custody, does not introduce async acceptance, and keeps
usage safety inside existing durable server usage visibility. Future rotation, audit retention,
server detachment, secret-store migration, or tombstone-retention behavior may require ADR
escalation.

No new ADR is required for `credentials.rotate-ssh` because it remains inside the same credential
lifecycle owner, uses an intention-revealing `rotate` command accepted by ADR-026, preserves
credential identity and server references, does not introduce async acceptance, and does not publish
a new event or public integration contract in the first slice. If a later rotation design introduces
audit/event history, secret-store migration policy, tombstone retention, or server-detachment side
effects, that later work must re-run the ADR gate.

## Current Implementation Notes And Migration Gaps

The current implementation has reusable SSH credential create/list/delete/rotate, server credential
attachment, server detail masked credential summaries, one-credential masked detail plus
active/inactive server usage visibility, Web saved-credential destructive deletion guarded by typed
confirmation and usage re-read, and Web saved-credential rotation guarded by usage visibility,
typed confirmation, and in-use acknowledgement.

`credentials.show` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, API/oRPC,
contracts, Web server detail, and tests.

`credentials.delete-ssh` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI,
API/oRPC, contracts, persistence, Web, and tests.

`credentials.rotate-ssh` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, API/oRPC,
contracts, persistence, Web, public docs/help, and tests.

## Open Questions

- None for read-only credential detail, normal active/inactive server usage visibility, delete
  safety, or rotation command semantics.
