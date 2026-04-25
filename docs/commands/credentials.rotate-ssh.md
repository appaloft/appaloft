# credentials.rotate-ssh Command Spec

## Metadata

- Operation key: `credentials.rotate-ssh`
- Command class: `RotateSshCredentialCommand`
- Input schema: `RotateSshCredentialCommandInput`
- Handler: `RotateSshCredentialCommandHandler`
- Use case: `RotateSshCredentialUseCase`
- Domain / bounded context: Runtime topology / SSH credential lifecycle
- Current status: active
- Source classification: normative contract

## Normative Contract

`credentials.rotate-ssh` replaces the secret material for one stored reusable SSH private-key
credential while preserving the credential id and existing deployment-target/server references.

```ts
type RotateSshCredentialResult = Result<RotateSshCredentialCommandOutput, DomainError>;
```

The command contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible credential returns `err(DomainError)`;
- confirmation mismatch returns `err(DomainError)`;
- usage-read failure returns `err(DomainError)` and must not be treated as zero usage;
- active or inactive visible server usage is allowed only when the caller explicitly acknowledges
  that usage;
- success persists the new credential material, preserves the credential id, preserves server
  references, and returns safe rotated metadata plus affected usage counts.

Command success means the credential library mutation was accepted and persisted. It does not mean
the new key can connect to any server. Operators should run `servers.test-connectivity` for affected
active servers after rotation.

The command must not:

- create a new credential id;
- clear or rewrite server `credential_id` references;
- detach, delete, revoke, or archive the credential;
- mutate deployment targets/servers, deployments, resources, proxy state, runtime state, terminal
  sessions, logs, or audit state;
- test live connectivity or prove the new credential works;
- scan local SSH agents, local key files, shell history, Docker, runtime logs, terminal sessions, or
  provider state;
- return old or new private key material, public key bodies, local key paths, passphrases, raw SSH
  command lines, or provider credentials.

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
- [Reusable SSH Credential Rotation Feature Spec](../specs/001-reusable-ssh-credential-rotation/spec.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type RotateSshCredentialCommandInput = {
  credentialId: string;
  privateKey: string;
  publicKey?: string | null;
  username?: string | null;
  confirmation: {
    credentialId: string;
    acknowledgeServerUsage?: boolean;
  };
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `credentialId` | Required | Stored reusable SSH private-key credential to rotate. |
| `privateKey` | Required | New SSH private-key material to store. It is secret input and must never be echoed. |
| `publicKey` | Optional nullable | Replacement public-key metadata. `null` clears public-key metadata. Omitted preserves existing metadata. |
| `username` | Optional nullable | Replacement default username. `null` clears the default username. Omitted preserves the existing default username. |
| `confirmation.credentialId` | Required | Typed confirmation. It must exactly match `credentialId` after input normalization. |
| `confirmation.acknowledgeServerUsage` | Required when usage is nonzero | Confirms the operator understands that active/inactive visible servers referencing this credential will use the rotated material for future work. |
| `idempotencyKey` | Optional | Future coordination hook. It does not bypass confirmation, usage read, acknowledgement, or mutation safety. |

The input must not accept server ids, detach flags, force flags, cleanup flags, connectivity-test
options, provider-native ids, repository config identity, key paths, passphrases, or deleted-server
tombstone filters. CLI adapters may read a local private-key file, but the command input receives
secret key content, not the path.

## Output Model

```ts
type RotateSshCredentialCommandOutput = {
  schemaVersion: "credentials.rotate-ssh/v1";
  credential: {
    id: string;
    kind: "ssh-private-key";
    usernameConfigured: boolean;
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
    rotatedAt: string;
  };
  affectedUsage: {
    totalServers: number;
    activeServers: number;
    inactiveServers: number;
    servers: Array<{
      serverId: string;
      serverName: string;
      lifecycleStatus: "active" | "inactive";
      providerKey: string;
      host: string;
      username?: string;
    }>;
  };
};
```

The output is safe for Web, CLI, API, logs, and future tool results. It must not include private
keys, public key bodies, local paths, passphrases, command output, or provider credentials.

`credentials.show` remains the read surface after rotation. It should expose rotated metadata as a
backward-compatible extension, such as an optional `rotatedAt` field, without requiring callers to
inspect command output for ongoing state.

## Safety Algorithm

Command admission must execute these checks in order:

1. Normalize and validate `credentialId`.
2. Validate new secret input as non-empty credential material. If the implementation has a safe SSH
   key parser, parse failures return `validation_error` at phase `command-validation`.
3. Read masked credential metadata and verify the credential exists as a stored reusable
   `ssh-private-key` credential.
4. Verify typed confirmation matches the normalized credential id.
5. Derive active/inactive visible server usage through the same durable usage reader used by
   `credentials.show`.
6. Reject with `credential_rotation_requires_usage_acknowledgement` when
   `usage.totalServers > 0` and `confirmation.acknowledgeServerUsage !== true`.
7. Persist the rotated credential material and safe metadata through a named credential mutation
   specification.
8. Return safe rotated metadata and affected usage counts.

The repository API must stay collection-like. It must not expose business verbs such as
`rotateCredential` or `rotateWhenInUse`; the application use case chooses a credential mutation spec,
and the PG/PGlite adapter translates that spec into a guarded physical update.

## Error Contract

All whole-command failures use [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Command input, secret material, or confirmation is invalid. |
| `not_found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `credential-read` | Conditional | Masked credential metadata cannot be safely read. |
| `infra_error` | `credential-usage-read` | Conditional | Usage summary cannot be safely derived. |
| `credential_rotation_requires_usage_acknowledgement` | `credential-safety-check` | No | Visible server usage exists and the caller did not acknowledge the in-use rotation impact. |
| `credential_secret_unavailable` | `credential-mutation` | Conditional | New credential material could not be safely stored through the credential store. |
| `infra_error` | `credential-mutation` | Conditional | The persistence adapter could not safely persist the rotated credential. |

Error details may include credential id, usage counts, and safe server ids. Error details must not
include old or new key material, local paths, passphrases, raw SSH command output, terminal
transcripts, deployment logs, or provider credentials.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Saved SSH credentials surface reads usage, requires exact credential-id confirmation, requires in-use acknowledgement when usage is nonzero, and dispatches `RotateSshCredentialCommand` through the typed oRPC client. | Implemented |
| CLI | `appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>` dispatches `RotateSshCredentialCommand`; nonzero usage also requires `--acknowledge-server-usage`. | Implemented |
| oRPC / HTTP | `POST /api/credentials/ssh/{credentialId}/rotate` using the command schema. | Implemented |
| Repository config | Not applicable. Repository config must not select credential identity or raw credential material. | Not applicable |
| Automation / MCP | Future command/tool over the same operation key and command schema. | Future |
| Public docs | Existing `server.ssh-credential` anchor explains in-place rotation, usage acknowledgement, connectivity testing, and Web/CLI/API entrypoints. | Implemented |

## Current Implementation Notes And Migration Gaps

`credentials.rotate-ssh` is implemented across application command handling, core aggregate
mutation, PG/PGlite persistence, operation catalog, CLI, HTTP/oRPC, Web saved credential dialog,
public docs, and targeted tests.

Users can still choose the manual new-credential workflow when they want a new credential id instead
of preserving existing server references.

No credential rotation event is emitted in the first planned slice. A future audit/event history
slice must add an event spec and tests before publishing credential mutation events.

## Open Questions

- None blocking Testing/Test-First Round.
