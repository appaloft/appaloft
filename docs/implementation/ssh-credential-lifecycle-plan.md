# SSH Credential Lifecycle Implementation Plan

## Source Of Truth

This document plans SSH credential lifecycle visibility and delete-when-unused implementation. It
does not replace the query, command, workflow, error, or testing specs.

## Governed Operations

- `credentials.show`
- `credentials.delete-ssh`

Existing operations used for context:

- `credentials.create-ssh`
- `credentials.list-ssh`
- `servers.configure-credential`
- `servers.show`
- `servers.delete-check`

## Governed Specs

- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [credentials.delete-ssh Command Spec](../commands/credentials.delete-ssh.md)
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

## Visibility Code Round Ordering

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

## Delete-When-Unused Code Round Ordering

1. Add application command schema/message/handler/use case for `credentials.delete-ssh`.
2. Use the masked credential read model to confirm the credential exists without loading private or
   public key material into command output.
3. Use the existing credential usage reader to derive active/inactive visible server references.
4. Reject usage-read failure with `infra_error`, phase `credential-usage-read`; do not treat it as
   zero usage.
5. Reject active/inactive visible usage with `credential_in_use`, phase
   `credential-safety-check`.
6. Add a named unused credential selection spec and implement the existing collection-like
   repository shape with `deleteOne(context, spec)`, so the adapter physically deletes from
   `ssh_credentials` only when no active/inactive visible server row references the credential at
   delete time.
7. Add `CORE_OPERATIONS.md` implemented row and `packages/application/src/operation-catalog.ts`
   entry in the same Code Round that exposes the command publicly.
8. Add oRPC/OpenAPI route using the application command schema, not a transport-only input shape.
9. Add CLI command dispatching `DeleteSshCredentialCommand`.
10. Add Web destructive action with exact typed confirmation, i18n copy, tests, and help link.
11. Add tests named with the matrix ids from
    [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md).
12. Update public docs/help coverage under `server.ssh-credential`.

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

Add a vertical command slice in the same operation area:

- `delete-ssh-credential.schema.ts`;
- `delete-ssh-credential.command.ts`;
- `delete-ssh-credential.handler.ts`;
- `delete-ssh-credential.use-case.ts`.

Expected command shape:

```ts
type DeleteSshCredentialCommandInput = {
  credentialId: string;
  confirmation: {
    credentialId: string;
  };
  idempotencyKey?: string;
};
```

Expected service result:

```ts
type DeleteSshCredentialCommandOutput = {
  id: string;
};
```

The handler delegates to the use case and returns the typed `Result`.

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

The delete repository path must:

- delete only from the `ssh_credentials` table;
- use `deleteOne(context, spec)`, not a business verb such as `deleteWhenUnused`;
- include a final active/inactive server-reference guard in the physical delete through the named
  unused selection spec;
- return `false` without clearing `servers.credential_id` when visible usage exists;
- avoid selecting or returning private key material and public key bodies.

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
appaloft server credential-delete <credentialId> --confirm <credentialId>
DELETE /api/credentials/ssh/{credentialId}
```

The CLI command name may receive a later credential namespace alias, but it must map to operation
key `credentials.show` / `credentials.delete-ssh` and the matching query/command schema.

## Current Implementation Notes And Migration Gaps

The current Code Rounds implement `credentials.show` through application query service, PG/PGlite
read models, CLI, HTTP/oRPC, contracts, operation catalog, Web server detail, and docs/help
coverage.

The current Code Round implements `credentials.delete-ssh` through application command use case,
PG/PGlite guarded delete via `deleteOne(context, spec)`, CLI, HTTP/oRPC, Web, contracts, operation
catalog, and docs/help coverage.

Existing Web server registration and Quick Deploy credential steps still list and create reusable
SSH credentials. Server detail calls `credentials.show` for one-credential usage visibility when a
stored reusable credential id exists. The Web saved SSH credentials surface can delete an unused
stored credential after exact typed confirmation and a usage re-read.

## Expected Web Scope

Web exposes usage visibility from server detail when the server's masked credential summary includes
a stored reusable credential id. The saved SSH credentials surface lists reusable credentials and
uses the same query/display contract before destructive deletion.

The Web affordance must:

- show masked metadata only;
- show usage counts and normal visible server references;
- distinguish zero usage from usage-read unavailable;
- use `packages/i18n` keys for user-facing copy;
- expose destructive delete only through a modal requiring the exact credential id;
- disable submission when usage is unavailable, usage is nonzero, or confirmation mismatches;
- dispatch through the typed oRPC client.

## Public Documentation Requirement

The Code Rounds reuse existing public topic `server.ssh-credential` and the stable anchor
`/docs/servers/credentials/ssh-keys/#server-ssh-credential-path`.

If Web, CLI, or API help needs a more specific usage-visibility anchor, complete a Docs Round before
calling the behavior fully user-visible.

`credentials.delete-ssh` requires the public page to explain unused-only deletion, in-use
rejection, usage-read-unavailable rejection, and Web/CLI/API entrypoints. Future rotate/update
commands require task-oriented public docs for safe rotation before they are complete.

## Minimal Deliverable

- `credentials.show` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- `credentials.delete-ssh` is active in `CORE_OPERATIONS.md` and `operation-catalog.ts`;
- application query slice returns masked credential detail plus optional usage;
- application command slice deletes only when usage is safely zero;
- PG/PGlite read model can read one credential and current active/inactive server usage;
- PG/PGlite repository can physically delete unused credentials without clearing visible server
  references;
- CLI and HTTP/oRPC dispatch through `ShowSshCredentialQuery` and
  `DeleteSshCredentialCommand`;
- Web exposes the owner-scoped usage affordance from server detail and a saved-credential delete
  dialog with usage re-read and exact typed confirmation;
- public docs/help points to `server.ssh-credential`;
- tests cover `SSH-CRED-SHOW-001` through `SSH-CRED-SHOW-008` and applicable
  `SSH-CRED-DELETE-*` / `SSH-CRED-ENTRY-*` rows.

## Non-Goals

This plan does not implement:

- credential rotation/update;
- credential detachment from servers;
- live connectivity testing;
- secret-store migration;
- audit/event history for credential mutations;
- deleted server tombstone usage visibility.

## Open Questions

- None for the active `credentials.show` and `credentials.delete-ssh` slices. A future
  `appaloft credential ...` namespace alias may be specified later, but the active CLI entrypoints
  remain `appaloft server credential-show <credentialId>` and
  `appaloft server credential-delete <credentialId> --confirm <credentialId>`.
