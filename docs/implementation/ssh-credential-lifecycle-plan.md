# SSH Credential Lifecycle Implementation Plan

## Source Of Truth

This document plans the first Code Round for SSH credential lifecycle visibility. It does not
replace the query, workflow, error, or testing specs.

## Governed Operations

- `credentials.show`

Existing operations used for context:

- `credentials.create-ssh`
- `credentials.list-ssh`
- `servers.configure-credential`
- `servers.show`
- `servers.delete-check`

## Governed Specs

- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md)
- [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Code Round Ordering

1. Add application query schema/message/handler/service for `credentials.show`.
2. Extend `SshCredentialReadModel` or add a dedicated credential detail read port for one masked
   credential.
3. Add a credential usage reader that derives normal visible server references from durable
   server/deployment-target state by reusable credential id.
4. Add PG/PGlite read-model implementation for credential detail and usage.
5. Add `CORE_OPERATIONS.md` implemented row and `packages/application/src/operation-catalog.ts`
   entry in the same Code Round that exposes the query publicly.
6. Add oRPC/OpenAPI route using the application query schema, not a transport-only input shape.
7. Add CLI command dispatching `ShowSshCredentialQuery`.
8. Add Web affordance from credential management or server detail surfaces when a stored reusable
   credential id is available.
9. Add tests named with the matrix ids from
   [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md).
10. Update public docs/help coverage if the existing `server.ssh-credential` anchor is insufficient
    for detail and usage visibility.

## Expected Application Scope

Add a vertical query slice under `packages/application/src/operations/servers` or a future
credential-specific directory if the package structure is split:

- `show-ssh-credential.schema.ts`;
- `show-ssh-credential.query.ts`;
- `show-ssh-credential.handler.ts`;
- `show-ssh-credential.query-service.ts`.

Expected query shape:

```ts
type ShowSshCredentialQueryInput = {
  credentialId: string;
  includeUsage?: boolean;
};
```

Expected service result:

```ts
type SshCredentialDetail = {
  schemaVersion: "credentials.show/v1";
  credential: SshCredentialSummary;
  usage?: SshCredentialUsageSummary;
  generatedAt: string;
};
```

The handler delegates to the query service and returns the typed `Result`.

## Expected Read-Model Scope

The first implementation may compose:

- existing `ssh_credentials` table rows for masked credential detail;
- server read-model rows where `credential_id` equals the selected reusable credential id and
  server lifecycle is not deleted.

The usage reader must not:

- read private key material for usage derivation;
- scan local files, SSH agents, shell history, Docker, terminal sessions, or runtime logs;
- include direct private-key or local-ssh-agent server credential attachments;
- return deleted server tombstones through the normal public query.

## Expected Transport Scope

When promoted to active, add the operation to:

- [Core Operations](../CORE_OPERATIONS.md) implemented operations table;
- `packages/application/src/operation-catalog.ts`;
- contracts exports;
- HTTP/oRPC route metadata and handler;
- CLI command registration/help;
- public docs operation coverage.

Recommended first transport shapes:

```text
GET /api/credentials/ssh/{credentialId}
appaloft server credential-show <credentialId>
```

The CLI command name may receive a later credential namespace alias, but it must map to operation
key `credentials.show` and query schema `ShowSshCredentialQueryInput`.

## Current Implementation Notes And Migration Gaps

The current Code Rounds implement `credentials.show` through application query service, PG/PGlite
read models, CLI, HTTP/oRPC, contracts, operation catalog, Web server detail, and docs/help
coverage.

Existing Web server registration and Quick Deploy credential steps still list and create reusable
SSH credentials. Server detail is the first read-only Web affordance that calls `credentials.show`
for one-credential usage visibility when a stored reusable credential id exists.

## Expected Web Scope

Web exposes usage visibility from server detail when the server's masked credential summary includes
a stored reusable credential id. A future dedicated credential management surface may reuse the same
query and display contract.

The Web affordance must:

- show masked metadata only;
- show usage counts and normal visible server references;
- distinguish zero usage from usage-read unavailable;
- use `packages/i18n` keys for user-facing copy;
- avoid a destructive delete or rotate control until those commands are specified and active.

## Public Documentation Requirement

The first Code Round may reuse existing public topic `server.ssh-credential` and the stable anchor
`/docs/servers/credentials/ssh-keys/#server-ssh-credential-path`.

If Web, CLI, or API help needs a more specific usage-visibility anchor, complete a Docs Round before
calling the behavior fully user-visible.

Future rotate/update or delete-when-unused commands require task-oriented public docs for safe
rotation/deletion before they are complete.

## Minimal Deliverable

- `credentials.show` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- application query slice returns masked credential detail plus optional usage;
- PG/PGlite read model can read one credential and current active/inactive server usage;
- CLI and HTTP/oRPC dispatch through `ShowSshCredentialQuery`;
- Web exposes the owner-scoped usage affordance from server detail;
- public docs/help points to `server.ssh-credential`;
- tests cover `SSH-CRED-SHOW-001` through `SSH-CRED-SHOW-008` and applicable
  `SSH-CRED-ENTRY-*` rows.

## Non-Goals

This plan does not implement:

- credential rotation/update;
- credential deletion;
- credential detachment from servers;
- live connectivity testing;
- secret-store migration;
- audit/event history for credential mutations;
- deleted server tombstone usage visibility.

## Open Questions

- None for the first active `credentials.show` slice. A future `appaloft credential ...` namespace
  alias may be specified later, but the active CLI entrypoint is
  `appaloft server credential-show <credentialId>`.
