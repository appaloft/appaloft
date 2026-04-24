# credentials.delete-ssh Command Spec

## Metadata

- Operation key: `credentials.delete-ssh`
- Command class: `DeleteSshCredentialCommand`
- Input schema: `DeleteSshCredentialCommandInput`
- Handler: `DeleteSshCredentialCommandHandler`
- Use case: `DeleteSshCredentialUseCase`
- Domain / bounded context: Runtime topology / SSH credential lifecycle
- Current status: active command
- Source classification: normative contract

## Normative Contract

`credentials.delete-ssh` permanently removes one stored reusable SSH private-key credential only
when durable active/inactive visible server usage is proven empty.

```ts
type DeleteSshCredentialResult = Result<{ id: string }, DomainError>;
```

The command contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible credential returns `err(DomainError)`;
- confirmation mismatch returns `err(DomainError)`;
- usage-read failure returns `err(DomainError)` and must not be treated as zero usage;
- active or inactive visible server usage returns `err(DomainError)` with code
  `credential_in_use`;
- success deletes the stored credential and returns `ok({ id })`.

The command must not:

- delete credentials that are still referenced by active or inactive visible servers;
- clear `server.credential_id` references as a side effect;
- detach, rotate, replace, revoke, or rewrite server credential state;
- test connectivity, inspect live SSH agents, scan local key files, shell history, Docker, runtime
  logs, terminal sessions, or provider state;
- return private key material, public key bodies, local key paths, passphrases, raw SSH command
  lines, or provider credentials.

## Global References

This command inherits:

- [Domain Model](../DOMAIN_MODEL.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md)
- [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md)
- [SSH Credential Lifecycle Implementation Plan](../implementation/ssh-credential-lifecycle-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type DeleteSshCredentialCommandInput = {
  credentialId: string;
  confirmation: {
    credentialId: string;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `credentialId` | Required | Stored reusable SSH private-key credential to delete. |
| `confirmation.credentialId` | Required | Typed confirmation. It must exactly match `credentialId` after input normalization. |
| `idempotencyKey` | Optional | Future coordination hook. It does not bypass usage safety. |

The input must not accept private keys, public key bodies, key paths, server ids, detach flags,
force flags, cleanup flags, connectivity-test options, provider-native ids, or deleted-server
tombstone filters.

## Output Model

```ts
type DeleteSshCredentialCommandOutput = {
  id: string;
};
```

The output is intentionally minimal and safe. It contains only the deleted credential id.

## Safety Algorithm

Command admission must execute these checks in order:

1. Normalize and validate `credentialId`.
2. Read masked credential metadata and verify the credential exists as a stored SSH private-key
   credential.
3. Verify typed confirmation matches the normalized credential id.
4. Derive active/inactive visible server usage through the same durable usage reader used by
   `credentials.show`.
5. Reject with `credential_in_use` when `usage.totalServers > 0`.
6. Reject with `infra_error` when usage cannot be read safely.
7. Delete the credential through `SshCredentialRepository.deleteOne(...)` using a named unused
   credential selection spec only when usage is still empty.

The repository API must stay collection-like. It must not expose business verbs such as
`deleteWhenUnused`; the application use case chooses the unused selection spec, and the PG/PGlite
adapter only translates that spec into the guarded physical delete. The PG/PGlite adapter must guard
the physical delete so a race with a new active/inactive server reference cannot clear server
credential state through foreign-key `ON DELETE` behavior.

## Error Contract

All whole-command failures use [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Command input or confirmation is invalid. |
| `not_found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `credential-read` | Conditional | Masked credential metadata cannot be safely read. |
| `infra_error` | `credential-usage-read` | Conditional | Usage summary cannot be safely derived. |
| `credential_in_use` | `credential-safety-check` | No | Active or inactive visible servers still reference the credential. |
| `infra_error` | `credential-mutation` | Conditional | The persistence adapter could not safely delete the credential. |

Error details may include credential id, usage counts, and safe server ids. Error details must not
include key material, local paths, passphrases, command output, logs, terminal transcripts, or
provider credentials.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Saved SSH credentials surface opens a destructive confirmation dialog, re-reads usage through `credentials.show`, requires exact credential-id confirmation, and dispatches `DeleteSshCredentialCommand` through the typed oRPC client only when usage is zero. | Implemented |
| CLI | `appaloft server credential-delete <credentialId> --confirm <credentialId>` dispatches `DeleteSshCredentialCommand`. | Implemented |
| oRPC / HTTP | `DELETE /api/credentials/ssh/{credentialId}` using the command schema. | Implemented |
| Repository config | Not applicable. Repository config must not select credential identity or raw credential material. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key and command schema. | Future |
| Public docs | Existing `server.ssh-credential` anchor covers safe reusable credential deletion across Web, CLI, and API. | Existing anchor |

## Current Implementation Notes And Migration Gaps

The active slice implements application, PG/PGlite, CLI, HTTP/oRPC, Web, operation catalog, and
public docs coverage. Web destructive deletion uses typed confirmation, localized copy, tests, and
the same `server.ssh-credential` help affordance.

No credential deletion domain event is emitted in this slice. A future audit/event history slice
must add an event spec and tests before publishing credential mutation events.

## Open Questions

- None for the active delete-when-unused command boundary.
