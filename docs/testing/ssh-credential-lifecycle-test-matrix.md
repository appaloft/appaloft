# SSH Credential Lifecycle Test Matrix

## Normative Contract

Tests for SSH credential lifecycle must prove that reusable SSH credential detail, usage
visibility, and delete-when-unused safety are shared across Web, CLI, HTTP/oRPC, and future
MCP/tool surfaces through the same operation contract.

The active behaviors in this matrix are query `credentials.show` and command
`credentials.delete-ssh`.

## Global References

This matrix inherits:

- [Business Operation Map](../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../CORE_OPERATIONS.md)
- [Domain Model](../DOMAIN_MODEL.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [credentials.delete-ssh Command Spec](../commands/credentials.delete-ssh.md)
- [SSH Credential Lifecycle Error Spec](../errors/credentials.lifecycle.md)
- [SSH Credential Lifecycle Implementation Plan](../implementation/ssh-credential-lifecycle-plan.md)
- [Deployment Target Lifecycle Workflow](../workflows/deployment-target-lifecycle.md)
- [Server Bootstrap And Proxy Workflow](../workflows/server-bootstrap-and-proxy.md)
- [Spec-Driven Testing](./SPEC_DRIVEN_TESTING.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Test Layers

| Layer | SSH credential lifecycle focus |
| --- | --- |
| Query service | Reads one credential, masks key material, and composes usage. |
| Delete use case | Deletes only when masked metadata exists, confirmation matches, and usage is safely zero. |
| Usage reader | Finds durable server references by reusable credential id without scanning secrets or runtime state. |
| Persistence/read model | PG/PGlite can read credential detail and usage after restart/migration and can physically delete only unused credentials. |
| Operation catalog contract | `credentials.show` and `credentials.delete-ssh` are added only when CLI and HTTP/oRPC transport metadata are ready. |
| Entry surfaces | CLI, API/oRPC, Web, and future tools reuse the query/command schemas and show usage-read failure separately from zero usage. Web destructive delete requires typed credential-id confirmation and a fresh usage read before dispatch. |
| Public docs/help | Reuses `server.ssh-credential` help anchor and does not expose secret material. |

## Query Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected usage state |
| --- | --- | --- | --- | --- | --- | --- |
| SSH-CRED-SHOW-001 | integration | Existing credential detail | Reusable SSH private-key credential exists with name, username, and optional public key. | `credentials.show` returns `ok` with `schemaVersion = "credentials.show/v1"` and masked credential metadata. | None | Usage may be empty or present depending on server references. |
| SSH-CRED-SHOW-002 | integration | Missing credential | Credential id does not exist or is not visible. | Query returns `err`. | `not_found`, phase `credential-read` | No usage section. |
| SSH-CRED-SHOW-003 | integration | Usage summary | Two active servers and one inactive server reference the credential through stored credential reference state. | Query returns `ok`. | None | `totalServers = 3`, active/inactive counts match, and server rows include ids, names, lifecycle, provider key, host, and optional username. |
| SSH-CRED-SHOW-004 | integration | No reusable usage | Credential exists but no server references its credential id; other servers use direct private key or local SSH agent. | Query returns `ok`. | None | Usage counts are zero and direct/local-agent server credentials are not included. |
| SSH-CRED-SHOW-005 | integration | Usage omitted by caller | Credential exists and caller sets `includeUsage = false`. | Query returns `ok`. | None | `usage` is omitted and no usage reader is required. |
| SSH-CRED-SHOW-006 | integration | Usage read unavailable | Credential exists, `includeUsage = true`, and usage reader fails. | Query returns `err`. | `infra_error`, phase `credential-usage-read` | Query must not return empty usage as a fallback. |
| SSH-CRED-SHOW-007 | integration | Secret redaction | Credential has private key and public key stored. | Query returns `ok`. | None | Result does not contain private key, public key body, key paths, SSH commands, or credential-bearing strings. |
| SSH-CRED-SHOW-008 | integration | PGlite read-model projection | Credential row exists; active, inactive, deleted, and direct-key server rows exist. | Read models return masked credential detail and only active/inactive reusable server references. | None | Deleted and direct-key servers are omitted; credential default username is used when a server has no override. |

## Command Matrix

| Test ID | Preferred automation | Case | Input/state | Expected result | Expected error | Expected deletion state |
| --- | --- | --- | --- | --- | --- | --- |
| SSH-CRED-DELETE-001 | integration | Unused credential delete succeeds | Stored reusable SSH private-key credential exists, confirmation matches, and usage reader returns zero active/inactive visible servers. | `credentials.delete-ssh` returns `ok({ id })`. | None | Credential is deleted through the repository/persistence adapter. |
| SSH-CRED-DELETE-002 | integration | Active/inactive usage blocks delete | Active and inactive visible servers reference the credential through stored credential reference state. | Command returns `err`. | `credential_in_use`, phase `credential-safety-check`, with usage counts. | Credential remains stored and server references are unchanged. |
| SSH-CRED-DELETE-003 | integration | Usage read unavailable blocks delete | Credential exists, confirmation matches, and usage reader fails. | Command returns `err`. | `infra_error`, phase `credential-usage-read`. | Delete is not attempted. |
| SSH-CRED-DELETE-004 | integration | Missing credential | Credential id does not exist or is not visible. | Command returns `err`. | `not_found`, phase `credential-read`. | Delete is not attempted. |
| SSH-CRED-DELETE-005 | integration | Confirmation mismatch | Credential exists but `confirmation.credentialId` does not match the normalized `credentialId`. | Command returns `err`. | `validation_error`, phase `command-validation`. | Usage read and delete are not attempted. |
| SSH-CRED-DELETE-006 | integration | Secret redaction | Credential has private key and public key stored and delete is rejected. | Error/result details contain only safe ids and counts. | Depends on branch. | No private key, public key body, key path, SSH command, or credential-bearing string appears. |
| SSH-CRED-DELETE-007 | integration | PGlite unused physical delete | Credential row exists; deleted server tombstone, direct-key, and local-agent server rows do not count as usage. | PG/PGlite `deleteOne` with the unused selection spec returns `true`. | None | Credential row is removed; unrelated server rows remain unchanged. |
| SSH-CRED-DELETE-008 | integration | PGlite guarded delete refuses visible usage | Active or inactive server row references the credential. | PG/PGlite `deleteOne` with the unused selection spec returns `false`. | None at adapter boundary. | Credential row remains and server `credential_id` remains unchanged. |

## Entrypoint Matrix

| Test ID | Preferred automation | Entry | Expected behavior |
| --- | --- | --- |
| SSH-CRED-ENTRY-001 | contract | Operation catalog | When promoted to active, `credentials.show` appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same Code Round with CLI and HTTP/oRPC transports. |
| SSH-CRED-ENTRY-002 | e2e-preferred | CLI | `appaloft server credential-show <credentialId>` or accepted alias dispatches `ShowSshCredentialQuery` and structured output contains masked detail plus usage counts. |
| SSH-CRED-ENTRY-003 | e2e-preferred | HTTP/oRPC | `GET /api/credentials/ssh/{credentialId}` dispatches `ShowSshCredentialQuery` using the application schema and maps structured errors by code/category/phase. |
| SSH-CRED-ENTRY-004 | e2e-preferred | Web | Credential management surface or server detail link reads the same query and distinguishes zero usage from usage-read unavailable. |
| SSH-CRED-ENTRY-005 | contract | Public docs/help | Help surfaces point to `server.ssh-credential`; docs explain masked credential metadata and usage visibility without exposing internal CQRS terminology. |
| SSH-CRED-ENTRY-006 | contract | Operation catalog | `credentials.delete-ssh` appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` in the same Code Round with CLI and HTTP/oRPC transports. |
| SSH-CRED-ENTRY-007 | e2e-preferred | CLI | `appaloft server credential-delete <credentialId> --confirm <credentialId>` dispatches `DeleteSshCredentialCommand` through `CommandBus`. |
| SSH-CRED-ENTRY-008 | e2e-preferred | HTTP/oRPC | `DELETE /api/credentials/ssh/{credentialId}` dispatches `DeleteSshCredentialCommand` using the application schema and maps structured errors by code/category/phase. |
| SSH-CRED-ENTRY-009 | contract | Web destructive action | Web saved SSH credentials surface opens a destructive dialog, reads usage, blocks unavailable/nonzero usage, requires exact credential-id confirmation, uses localized copy, links to `server.ssh-credential`, and dispatches the typed oRPC delete client. |
| SSH-CRED-ENTRY-010 | contract | Public docs/help | Help surfaces point to `server.ssh-credential`; docs explain unused-only deletion, in-use rejection, usage-read-unavailable rejection, and Web/CLI/API entrypoints without exposing secret material. |

## Automated Targets

| Test ID | Test file | Current state |
| --- | --- | --- |
| SSH-CRED-SHOW-001 through SSH-CRED-SHOW-007 | `packages/application/test/show-ssh-credential.test.ts` | Passing. |
| SSH-CRED-SHOW-008 | `packages/persistence/pg/test/ssh-credential-read-model.pglite.test.ts` | Passing. |
| SSH-CRED-ENTRY-001 | `packages/application/test/operation-catalog-boundary.test.ts` | Passing. |
| SSH-CRED-ENTRY-002 | `packages/adapters/cli/test/server-command.test.ts` | Passing. |
| SSH-CRED-ENTRY-003 | `packages/orpc/test/ssh-credential-show.http.test.ts` | Passing. |
| SSH-CRED-ENTRY-004 | `apps/web/test/e2e-webview/home.webview.test.ts` | Passing. |
| SSH-CRED-ENTRY-005 | `packages/docs-registry/test/operation-coverage.test.ts` | Passing. |
| SSH-CRED-DELETE-001 through SSH-CRED-DELETE-006 | `packages/application/test/delete-ssh-credential.test.ts` | Passing. |
| SSH-CRED-DELETE-007 through SSH-CRED-DELETE-008 | `packages/persistence/pg/test/ssh-credential-delete.pglite.test.ts` | Passing. |
| SSH-CRED-ENTRY-006 | `packages/application/test/operation-catalog-boundary.test.ts` | Passing. |
| SSH-CRED-ENTRY-007 | `packages/adapters/cli/test/server-command.test.ts` | Passing. |
| SSH-CRED-ENTRY-008 | `packages/orpc/test/ssh-credential-delete.http.test.ts` | Passing. |
| SSH-CRED-ENTRY-009 | `apps/web/src/lib/console/ssh-credential-delete.test.ts`; `apps/web/src/lib/console/docs-help.test.ts` | Passing. |
| SSH-CRED-ENTRY-010 | `packages/docs-registry/test/operation-coverage.test.ts` | Passing. |

## Future Mutation Matrix Placeholders

Future rotate/update commands must add new numbered rows before Code Round. At minimum they must
cover:

- in-use safety rejection;
- secret-store persistence failure;
- server attachment snapshot semantics;
- Web/API/CLI confirmation affordances;
- event/audit behavior if mutation events are introduced.

These placeholders are not executable test requirements until the future command specs are
accepted.

## Current Implementation Notes And Migration Gaps

Automated tests cover `credentials.show` at application query-service, PG/PGlite read-model,
operation-catalog, CLI-dispatch, HTTP/oRPC-dispatch, Web server detail, and public docs/help
registry boundaries.

Automated tests cover `credentials.delete-ssh` at application use-case, PG/PGlite guarded delete,
operation-catalog, CLI-dispatch, HTTP/oRPC-dispatch, Web typed-confirmation/readiness guards, Web
help/source wiring, and public docs/help registry boundaries.

## Open Questions

- None for the `credentials.show` matrix rows.
