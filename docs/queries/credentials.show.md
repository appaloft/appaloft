# credentials.show Query Spec

## Metadata

- Operation key: `credentials.show`
- Query class: `ShowSshCredentialQuery`
- Input schema: `ShowSshCredentialQueryInput`
- Handler: `ShowSshCredentialQueryHandler`
- Query service: `ShowSshCredentialQueryService`
- Domain / bounded context: Runtime topology / SSH credential read model
- Current status: active query
- Source classification: normative contract

## Normative Contract

`credentials.show` is the source-of-truth query for one reusable SSH credential detail and usage
visibility surface.

It is read-only. It must not:

- return private key material, public key bodies, filesystem paths, or provider credentials;
- test connectivity or prove that a credential still works;
- configure a deployment target/server credential;
- rotate, replace, detach, delete, or revoke credential state;
- inspect live SSH agents, local keychains, Docker, SSH, terminal sessions, or runtime state.

```ts
type ShowSshCredentialResult = Result<SshCredentialDetail, DomainError>;
```

The query contract is:

- validation failure returns `err(DomainError)`;
- missing or invisible credential returns `err(DomainError)`;
- success returns `ok(SshCredentialDetail)`;
- usage visibility is derived from durable server/deployment-target state and may be omitted only
  when the caller explicitly sets `includeUsage = false`.

## Global References

This query inherits:

- [Domain Model](../DOMAIN_MODEL.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [ADR-010: Quick Deploy Workflow Boundary](../decisions/ADR-010-quick-deploy-workflow-boundary.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.delete-ssh Command Spec](../commands/credentials.delete-ssh.md)
- [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md)
- [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md)
- [SSH Credential Lifecycle Implementation Plan](../implementation/ssh-credential-lifecycle-plan.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Input Model

```ts
type ShowSshCredentialQueryInput = {
  credentialId: string;
  includeUsage?: boolean;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `credentialId` | Required | Reusable SSH credential to read. |
| `includeUsage` | Optional, defaults to `true` | Include safe deployment-target/server usage summary. |

The input must not accept raw private keys, public key bodies, username overrides, server mutation
flags, detach/delete/rotate options, connectivity test options, or provider-native ids.

## Output Model

```ts
type SshCredentialDetail = {
  schemaVersion: "credentials.show/v1";
  credential: {
    id: string;
    name: string;
    kind: "ssh-private-key";
    username?: string;
    publicKeyConfigured: boolean;
    privateKeyConfigured: boolean;
    createdAt: string;
  };
  usage?: {
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
  generatedAt: string;
};
```

`credential` is a masked credential summary. It exposes only metadata and booleans for configured
key material.

`usage` includes only deployment targets/servers that currently reference the reusable SSH
credential through stored credential reference state. Servers configured with a direct private key
or local SSH agent are not usage of a reusable SSH credential.

Normal usage visibility includes active and inactive servers. Deleted server tombstones are omitted
from the first public detail surface; future audit or delete-safety readers may expose retained
tombstone blockers after those surfaces are specified.

## Error Contract

All whole-query failures use [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md).

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `query-validation` | No | `credentialId` or optional input is invalid. |
| `not_found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `credential-read` | Conditional | Base credential read model cannot be safely read. |
| `infra_error` | `credential-usage-read` | Conditional | Usage summary cannot be safely derived. |

If `includeUsage = true` and usage derivation fails, the first active slice must fail the whole
query with `phase = credential-usage-read` so CLI/API/Web users do not mistake missing usage for
zero usage.

## Entrypoints

| Entrypoint | Mapping | Status |
| --- | --- | --- |
| Web | Server detail reads this query when the target is attached to a stored reusable SSH credential id and displays masked detail plus usage state. | Implemented |
| CLI | `appaloft server credential-show <credentialId>` or a later accepted credential namespace alias. | Implemented |
| oRPC / HTTP | `GET /api/credentials/ssh/{credentialId}` using the query schema. | Implemented |
| Repository config | Not applicable. Repository config must not select credential identity. | Not applicable |
| Automation / MCP | Future query/tool over the same operation key. | Future |
| Public docs | Existing `server.ssh-credential` anchor covers reusable SSH credential safety, usage visibility, and delete-when-unused preconditions. | Existing anchor |

## Current Implementation Notes And Migration Gaps

`credentials.show` is active in `CORE_OPERATIONS.md`, `operation-catalog.ts`, CLI, API/oRPC,
contracts, application query services, PG/PGlite read models, and the Web server detail surface.
Existing Web server registration and Quick Deploy surfaces can list and create reusable SSH
credentials; server detail is the first read-only owner-scoped Web affordance for one-credential
usage visibility.

This query is the required visibility step before `credentials.delete-ssh`. The delete command
must re-read usage for admission and must not treat usage-read failure as zero usage.

Credential rotate/update remains future behavior and needs its own command specs, safety rules,
test matrix rows, and operation catalog entries before implementation.

## Open Questions

- None for the read-only `credentials.show` query boundary.
